
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

    return router;
};
