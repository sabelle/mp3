
const mongoose = require('mongoose');
const User = require('../models/users');
const Task = require('../models/tasks');


/* =========================================
   ERROR HANDLING
========================================= */

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const bad = (message) => {
    throw new ApiError(400, message);
};

const missing = (message) => {
    throw new ApiError(404, message);
};

const reply = (res, err) => {
    if (!(err instanceof ApiError)) {
        console.error(err);
    }

    return res.status(err instanceof ApiError ? err.status : 500).json({
        message: err instanceof ApiError
            ? err.message
            : 'An unexpected server error occurred',
        data: null
    });
};


/* =========================================
   GENERAL VALIDATION HELPERS
========================================= */

const validId = (id) => {
    return mongoose.isObjectIdOrHexString(id);
};

const object = (value) => {
    return value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value);
};

function checkString(value, field, required = false) {
    if (required
        ? typeof value !== 'string' || !value.trim()
        : value !== undefined && typeof value !== 'string') {
        bad(`Invalid ${field}`);
    }
}


/* =========================================
   USER VALIDATION
========================================= */

function userInput(body) {
    if (!object(body)) {
        bad('Invalid user body');
    }

    // Validate required fields
    checkString(body.name, 'name', true);
    checkString(body.email, 'email', true);

    // Validate pending task IDs
    const ids = body.pendingTasks === undefined
        ? []
        : body.pendingTasks;

    if (!Array.isArray(ids) ||
        ids.some(id => typeof id !== 'string' || !validId(id))) {
        bad('Invalid pendingTasks');
    }

    if (new Set(ids).size !== ids.length) {
        bad('Duplicate task IDs in pendingTasks');
    }

    return {
        name: body.name,
        email: body.email,
        pendingTasks: ids
    };
}


/* =========================================
   TASK VALIDATION
========================================= */

function taskInput(body) {
    if (!object(body)) {
        bad('Invalid task body');
    }

    // Validate required fields
    checkString(body.name, 'name', true);

    if (!(typeof body.deadline === 'string' ||
        body.deadline instanceof Date) ||
        !body.deadline ||
        Number.isNaN(new Date(body.deadline).getTime())) {
        bad('Invalid deadline');
    }

    // Validate optional fields
    checkString(body.description, 'description');

    if (body.completed !== undefined &&
        typeof body.completed !== 'boolean') {
        bad('Invalid completed');
    }

    checkString(body.assignedUser, 'assignedUser');
    checkString(body.assignedUserName, 'assignedUserName');

    // Validate assigned user ID
    const assignedUser = body.assignedUser === undefined
        ? ''
        : body.assignedUser;

    if (assignedUser && !validId(assignedUser)) {
        bad('Invalid assignedUser');
    }

    // Validate unassigned task name
    if (!assignedUser &&
        body.assignedUserName !== undefined &&
        body.assignedUserName !== 'unassigned') {
        bad('Assigned user name must be unassigned');
    }

    return {
        name: body.name,
        description: body.description ?? '',
        deadline: new Date(body.deadline),
        completed: body.completed ?? false,
        assignedUser: assignedUser,
        assignedUserName: body.assignedUserName
    };
}


/* =========================================
   QUERY PARAMETER VALIDATION
========================================= */

function parseObjectParam(value, name) {
    if (value === undefined) {
        return {};
    }

    let result;

    try {
        result = JSON.parse(value);
    } catch {
        bad(`Invalid JSON in ${name}`);
    }

    if (!object(result)) {
        bad(`Invalid ${name}`);
    }

    return result;
}


function projection(value) {
    const p = parseObjectParam(value, 'select');

    // Validate projection values
    if (Object.values(p).some(v => v !== 0 && v !== 1)) {
        bad('Invalid select');
    }

    // MongoDB does not allow mixing inclusion and exclusion,
    // except for the _id field
    const nonId = Object.entries(p)
        .filter(([key]) => key !== '_id')
        .map(([, value]) => value);

    if (nonId.includes(0) && nonId.includes(1)) {
        bad('Cannot mix inclusion and exclusion in select');
    }

    return p;
}


function queryParams(query, isTasks) {
    // Parse JSON query parameters
    const where = parseObjectParam(query.where, 'where');
    const sort = parseObjectParam(query.sort, 'sort');
    const select = projection(query.select);

    // Validate sort values
    if (Object.values(sort).some(v => v !== 1 && v !== -1)) {
        bad('Invalid sort');
    }

    // Parse and validate pagination
    function number(value, fallback, name) {
        if (value === undefined) {
            return fallback;
        }

        if (typeof value !== 'string' || !/^\d+$/.test(value)) {
            bad(`Invalid ${name}`);
        }

        const n = Number(value);

        if (!Number.isSafeInteger(n)) {
            bad(`Invalid ${name}`);
        }

        return n;
    }

    const skip = number(query.skip, 0, 'skip');
    const limit = number(query.limit, isTasks ? 100 : null, 'limit');

    // Validate count parameter
    if (query.count !== undefined &&
        query.count !== 'true' &&
        query.count !== 'false') {
        bad('Invalid count');
    }

    return {
        where,
        sort,
        select,
        skip,
        limit,
        count: query.count === 'true'
    };
}


/* =========================================
   GET HELPERS
========================================= */

// GET collection
async function list(Model, req, res, isTasks) {
    try {
        const q = queryParams(req.query, isTasks);

        // Return document count
        if (q.count) {
            const count = await Model.countDocuments(q.where);

            return res.status(200).json({
                message: 'OK',
                data: count
            });
        }

        // Build Mongoose query
        let dbQuery = Model.find(q.where)
            .sort(q.sort)
            .select(q.select)
            .skip(q.skip);

        if (q.limit !== null) {
            dbQuery = dbQuery.limit(q.limit);
        }

        const results = await dbQuery.exec();

        return res.status(200).json({
            message: 'OK',
            data: results
        });

    } catch (err) {
        return reply(res, err);
    }
}


// GET document by ID
async function getOne(Model, req, res, label) {
    try {
        // Validate ID format
        if (!validId(req.params.id)) {
            missing(`${label} not found`);
        }

        // ID existence takes priority over malformed query parameters
        const exists = await Model.exists({
            _id: req.params.id
        });

        if (!exists) {
            missing(`${label} not found`);
        }

        // Parse field selection
        const select = projection(req.query.select);

        const result = await Model.findById(req.params.id)
            .select(select);

        return res.status(200).json({
            message: 'OK',
            data: result
        });

    } catch (err) {
        return reply(res, err);
    }
}


/* =========================================
   DATABASE TRANSACTIONS
========================================= */

async function transaction(work) {
    return mongoose.connection.transaction(
        async (session) => work(session)
    );
}


/* =========================================
   USER AND TASK RELATIONSHIP HELPERS
========================================= */

// Check whether an email is already in use
async function checkEmail(email, excludeId, session) {
    const existing = await User.findOne({ email })
        .session(session);

    if (existing &&
        String(existing._id) !== String(excludeId || '')) {
        bad('Email is already in use');
    }
}


// Validate that pending tasks exist and are incomplete
async function checkPending(ids, session) {
    const tasks = await Task.find({
        _id: { $in: ids }
    }).session(session);

    if (tasks.length !== ids.length) {
        missing('Referenced task not found');
    }

    if (tasks.some(task => task.completed)) {
        bad('Completed tasks cannot be pending');
    }

    return tasks;
}


// Find and validate a task's assigned user
async function resolveAssignee(input, session) {
    if (!input.assignedUser) {
        return null;
    }

    const user = await User.findById(input.assignedUser)
        .session(session);

    if (!user) {
        missing('Assigned user not found');
    }

    if (input.assignedUserName !== undefined &&
        input.assignedUserName !== user.name) {
        bad('Assigned user name does not match');
    }

    return user;
}


/* =========================================
   EXPORTS
========================================= */

module.exports = {
    ApiError,
    bad,
    missing,
    validId,
    reply,
    userInput,
    taskInput,
    projection,
    list,
    getOne,
    transaction,
    checkEmail,
    checkPending,
    resolveAssignee
};
