
// Get the packages we need
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Read .env file
require('dotenv').config();

// Create our Express application
const app = express();

// Use environment defined port or 3000
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(function () {
        console.log('Connected to MongoDB');
    })
    .catch(function (err) {
        console.error('MongoDB connection error:', err.message);
    });

// Allow CORS so that backend and frontend could be put on different servers
const allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};

app.use(allowCrossDomain);

// Parse URL-encoded and JSON request bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Use routes as a module (see index.js)
require('./routes')(app, router);

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
