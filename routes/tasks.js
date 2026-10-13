
var Task = require('../models/tasks');

module.exports = function (router) {

    var tasksRoute = router.route('/tasks');

    // GET /api/tasks
    tasksRoute.get(async function (req, res) {
        try {
            // Parse JSON query parameters
            var where = req.query.where
                ? JSON.parse(req.query.where)
                : {};

            var sort = req.query.sort
                ? JSON.parse(req.query.sort)
                : {};

            var select = req.query.select
                ? JSON.parse(req.query.select)
                : {};

            // Parse pagination parameters
            var skip = req.query.skip === undefined
                ? 0
                : Number(req.query.skip);

            var limit = req.query.limit === undefined
                ? 100
                : Number(req.query.limit);

            // Validate pagination
            if (!Number.isSafeInteger(skip) || skip < 0 ||
                !Number.isSafeInteger(limit) || limit < 0) {
                return res.status(400).json({
                    message: "Invalid skip or limit parameter",
                    data: null
                });
            }

            // Validate query parameter types
            function isObject(value) {
                return value !== null &&
                    typeof value === 'object' &&
                    !Array.isArray(value);
            }

            if (!isObject(where) ||
                !isObject(sort) ||
                !isObject(select)) {
                return res.status(400).json({
                    message: "Invalid query parameter format",
                    data: null
                });
            }

            // Return count instead of documents
            if (req.query.count === 'true') {
                var count = await Task.countDocuments(where);

                return res.status(200).json({
                    message: "OK",
                    data: count
                });
            }

            // Build Mongoose query
            var query = Task.find(where)
                .sort(sort)
                .select(select)
                .skip(skip)
                .limit(limit);

            var tasks = await query.exec();

            return res.status(200).json({
                message: "OK",
                data: tasks
            });

        } catch (err) {
            if (err instanceof SyntaxError) {
                return res.status(400).json({
                    message: "Invalid JSON query parameter",
                    data: null
                });
            }

            return res.status(500).json({
                message: "Unable to retrieve tasks",
                data: null
            });
        }
    });


    // POST /api/tasks
    tasksRoute.post(async function (req, res) {
        try {
            var { name, description, deadline, completed,
                  assignedUser, assignedUserName } = req.body;

            // Validate required fields
            if (typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({
                    message: "Task name is required",
                    data: null
                });
            }

            if (typeof deadline !== 'string' ||
                !deadline.trim() ||
                isNaN(new Date(deadline).getTime())) {
                return res.status(400).json({
                    message: "A valid deadline is required",
                    data: null
                });
            }

            // Validate optional fields
            if (description !== undefined &&
                typeof description !== 'string') {
                return res.status(400).json({
                    message: "Description must be a string",
                    data: null
                });
            }

            if (completed !== undefined &&
                typeof completed !== 'boolean') {
                return res.status(400).json({
                    message: "Completed must be a boolean",
                    data: null
                });
            }

            if (assignedUser !== undefined &&
                typeof assignedUser !== 'string') {
                return res.status(400).json({
                    message: "Assigned user must be a string",
                    data: null
                });
            }

            if (assignedUserName !== undefined &&
                typeof assignedUserName !== 'string') {
                return res.status(400).json({
                    message: "Assigned user name must be a string",
                    data: null
                });
            }

            // Temporary restriction until user assignment is implemented
            if (assignedUser && assignedUser !== "") {
                return res.status(400).json({
                    message: "Task assignment is not implemented yet",
                    data: null
                });
            }

            if (assignedUserName !== undefined &&
                assignedUserName !== "unassigned") {
                return res.status(400).json({
                    message: "Unassigned tasks must have the name 'unassigned'",
                    data: null
                });
            }

            // Create a new task
            var task = new Task({
                name: name,
                description: description,
                deadline: deadline,
                completed: completed,
                assignedUser: "",
                assignedUserName: "unassigned"
            });

            await task.save();

            return res.status(201).json({
                message: "Task created successfully",
                data: task
            });

        } catch (err) {
            return res.status(500).json({
                message: "Unable to create task",
                data: null
            });
        }
    });


    return router;
};
