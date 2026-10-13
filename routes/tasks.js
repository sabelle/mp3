var Task = require('../models/tasks');

module.exports = function (router) {

    var tasksRoute = router.route('/tasks');

    // GET /api/tasks
    tasksRoute.get(async function (req, res) {
        try {
            var tasks = await Task.find();

            res.status(200).json({
                message: "OK",
                data: tasks
            });
        } catch (err) {
            res.status(500).json({
                message: "Unable to retrieve tasks",
                data: null
            });
        }
    });

    return router;
};
