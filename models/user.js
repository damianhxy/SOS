var Promise = require("bluebird");
var nedb = require("nedb");
var bcryptjs = require("bcryptjs");
var settings = require("../controllers/settings.js");
var users = new nedb({ filename: "./database/users", autoload: true });
Promise.promisifyAll(users);
Promise.promisifyAll(bcryptjs);

// User Object: Username, Hash

exports.add = function(username, password) {
    return users.findOneAsync({ username: username })
    .then(function(user) {
        if (user) throw Error("User already exists");
        return bcryptjs.hashAsync(password, settings.hashRounds)
        .then(function(hash) {
            var user = {
                "username": username,
                "hash": hash
            };
            return users.insertAsync(user);
        });
    });
};

exports.all = function() {
    return users.findAsync({});
};

exports.authenticate = function(username, password) {
    return users.findOneAsync({ username: username })
    .then(function(user) {
        if (!user) throw Error("User does not exist");
        return bcryptjs.compareAsync(password, user.hash)
        .then(function(res) {
            if (!res) throw Error("Wrong password");
            return user;
        });
    });
};

exports.get = function(id) {
    return users.findOneAsync({ _id: id });
};
