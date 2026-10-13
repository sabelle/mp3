
const User = require('../models/users');
const Task = require('../models/tasks');
const C = require('../utils/common');

module.exports = function (router) {

    // Define routes
    const tasksRoute = router.route('/tasks');
    const taskRoute = router.route('/tasks/:id');


    /* =========================================
       GET
    ========================================= */

    // GET /api/tasks
    tasksRoute.get((req, res) => {
        return C.list(Task, req, res, true);
    });

    // GET /api/tasks/:id
    taskRoute.get((req, res) => {
        return C.getOne(Task, req, res, 'Task');
    });


    /* =========================================
       POST
    ========================================= */

    // POST /api/tasks
    tasksRoute.post(async (req, res) => {
        try {
            const input = C.taskInput(req.body);

            const task = await C.transaction(async (session) => {
                const user = await C.resolveAssignee(input, session);

                // Create the task
                const [created] = await Task.create(
                    [{
                        ...input,
                        assignedUserName: user ? user.name : 'unassigned'
                    }],
                    { session }
                );

                // Add pending task to assigned user
                if (user && !created.completed) {
                    await User.updateOne(
                        { _id: user._id },
                        { $addToSet: { pendingTasks: String(created._id) } },
                        { session }
                    );
                }

                return created;
            });

            return res.status(201).json({
                message: 'Task created successfully',
                data: task
            });

        } catch (err) {
            return C.reply(res, err);
        }
    });


    /* =========================================
       PUT
    ========================================= */

    // PUT /api/tasks/:id
    taskRoute.put(async (req, res) => {
        try {
            // Check that the task exists
            if (!C.validId(req.params.id) ||
                !await Task.exists({ _id: req.params.id })) {
                C.missing('Task not found');
            }

            const input = C.taskInput(req.body);

            const task = await C.transaction(async (session) => {
                const current = await Task.findById(req.params.id)
                    .session(session);

                if (!current) {
                    C.missing('Task not found');
                }

                const user = await C.resolveAssignee(input, session);

                // Remove task from previous user's pending tasks
                if (current.assignedUser) {
                    await User.updateOne(
                        { _id: current.assignedUser },
                        { $pull: { pendingTasks: String(current._id) } },
                        { session }
                    );
                }

                // Replace task fields
                current.name = input.name;
                current.description = input.description;
                current.deadline = input.deadline;
                current.completed = input.completed;
                current.assignedUser = input.assignedUser;
                current.assignedUserName = user ? user.name : 'unassigned';

                await current.save({ session });

                // Add task to new user's pending tasks if incomplete
                if (user && !current.completed) {
                    await User.updateOne(
                        { _id: user._id },
                        { $addToSet: { pendingTasks: String(current._id) } },
                        { session }
                    );
                }

                return current;
            });

            return res.status(200).json({
                message: 'Task updated successfully',
                data: task
            });

        } catch (err) {
            return C.reply(res, err);
        }
    });


    /* =========================================
       DELETE
    ========================================= */

    // DELETE /api/tasks/:id
    taskRoute.delete(async (req, res) => {
        try {
            if (!C.validId(req.params.id)) {
                C.missing('Task not found');
            }

            await C.transaction(async (session) => {
                const task = await Task.findById(req.params.id)
                    .session(session);

                if (!task) {
                    C.missing('Task not found');
                }

                // Remove task from assigned user's pending tasks
                if (task.assignedUser) {
                    await User.updateOne(
                        { _id: task.assignedUser },
                        { $pull: { pendingTasks: String(task._id) } },
                        { session }
                    );
                }

                // Delete the task
                await Task.deleteOne(
                    { _id: task._id },
                    { session }
                );
            });

            return res.status(204).end();

        } catch (err) {
            return C.reply(res, err);
        }
    });


    return router;
};
