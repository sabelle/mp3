
const User = require('../models/users');
const Task = require('../models/tasks');
const C = require('../utils/common');

module.exports = function (router) {

    // Define routes
    const usersRoute = router.route('/users');
    const userRoute = router.route('/users/:id');


    /* =========================================
       GET
    ========================================= */

    // GET /api/users
    usersRoute.get((req, res) => {
        return C.list(User, req, res, false);
    });

    // GET /api/users/:id
    userRoute.get((req, res) => {
        return C.getOne(User, req, res, 'User');
    });


    /* =========================================
       POST
    ========================================= */

    // POST /api/users
    usersRoute.post(async (req, res) => {
        try {
            const input = C.userInput(req.body);

            const user = await C.transaction(async (session) => {
                // Validate email uniqueness and pending tasks
                await C.checkEmail(input.email, null, session);
                const tasks = await C.checkPending(input.pendingTasks, session);

                // Create the user
                const [created] = await User.create(
                    [input],
                    { session }
                );

                // Assign pending tasks to the new user
                for (const task of tasks) {
                    // Remove task from previous user's pending tasks
                    if (task.assignedUser) {
                        await User.updateOne(
                            { _id: task.assignedUser },
                            { $pull: { pendingTasks: String(task._id) } },
                            { session }
                        );
                    }

                    // Update task assignment
                    await Task.updateOne(
                        { _id: task._id },
                        {
                            $set: {
                                assignedUser: String(created._id),
                                assignedUserName: created.name
                            }
                        },
                        { session }
                    );
                }

                return created;
            });

            return res.status(201).json({
                message: 'User created successfully',
                data: user
            });

        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    message: 'Email is already in use',
                    data: null
                });
            }

            return C.reply(res, err);
        }
    });


    /* =========================================
       PUT
    ========================================= */

    // PUT /api/users/:id
    userRoute.put(async (req, res) => {
        try {
            // Check that the user exists
            if (!C.validId(req.params.id) ||
                !await User.exists({ _id: req.params.id })) {
                C.missing('User not found');
            }

            const input = C.userInput(req.body);

            const user = await C.transaction(async (session) => {
                const current = await User.findById(req.params.id)
                    .session(session);

                if (!current) {
                    C.missing('User not found');
                }

                // Validate email uniqueness and pending tasks
                await C.checkEmail(input.email, current._id, session);
                const tasks = await C.checkPending(input.pendingTasks, session);
                const newSet = new Set(input.pendingTasks);

                // Unassign pending tasks removed from user's list
                for (const oldId of current.pendingTasks) {
                    if (!newSet.has(oldId)) {
                        await Task.updateOne(
                            {
                                _id: oldId,
                                assignedUser: String(current._id)
                            },
                            {
                                $set: {
                                    assignedUser: '',
                                    assignedUserName: 'unassigned'
                                }
                            },
                            { session }
                        );
                    }
                }

                // Assign requested pending tasks to this user
                for (const task of tasks) {
                    // Remove task from previous user's pending tasks
                    if (task.assignedUser &&
                        task.assignedUser !== String(current._id)) {
                        await User.updateOne(
                            { _id: task.assignedUser },
                            { $pull: { pendingTasks: String(task._id) } },
                            { session }
                        );
                    }

                    // Update task assignment
                    await Task.updateOne(
                        { _id: task._id },
                        {
                            $set: {
                                assignedUser: String(current._id),
                                assignedUserName: input.name
                            }
                        },
                        { session }
                    );
                }

                // Update names on completed tasks still assigned to user
                await Task.updateMany(
                    { assignedUser: String(current._id) },
                    { $set: { assignedUserName: input.name } },
                    { session }
                );

                // Replace user fields
                current.name = input.name;
                current.email = input.email;
                current.pendingTasks = input.pendingTasks;

                await current.save({ session });

                return current;
            });

            return res.status(200).json({
                message: 'User updated successfully',
                data: user
            });

        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    message: 'Email is already in use',
                    data: null
                });
            }

            return C.reply(res, err);
        }
    });


    /* =========================================
       DELETE
    ========================================= */

    // DELETE /api/users/:id
    userRoute.delete(async (req, res) => {
        try {
            if (!C.validId(req.params.id)) {
                C.missing('User not found');
            }

            await C.transaction(async (session) => {
                const user = await User.findById(req.params.id)
                    .session(session);

                if (!user) {
                    C.missing('User not found');
                }

                // Unassign all tasks belonging to this user
                await Task.updateMany(
                    { assignedUser: String(user._id) },
                    {
                        $set: {
                            assignedUser: '',
                            assignedUserName: 'unassigned'
                        }
                    },
                    { session }
                );

                // Delete the user
                await User.deleteOne(
                    { _id: user._id },
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
