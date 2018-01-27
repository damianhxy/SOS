var Promise = require("bluebird");
var path = require("path");
var nedb = require("nedb");
var moment = require("moment-timezone");
var fs = require("fs");
var files = new nedb({ filename: "./database/resources", autoload: true });
var keygen = require("keygenerator");
var encryptor = require("file-encryptor");
var sssa = require("sssa-js");
Promise.promisifyAll(files);
Promise.promisifyAll(files.find().constructor.prototype);
Promise.promisifyAll(encryptor);
Promise.promisifyAll(sssa);
Promise.promisifyAll(fs);

// File Object: File name, path, owner, parts, required parts, time, description

exports.add = function(req) {
    // Details
    var minimum = req.body.minimumShares;
    var total = req.body.totalShares;
    var name = req.body.name;
    var description = req.body.description;
    var filePath = req.file.path;
    // Generate key
    var password = keygen.password();
    var shares = sssa.create(minimum, total, password);
    // Encrypt File
    return encryptor.encryptFileAsync(filePath, path.join(filePath, ".dat"), password)
    .then(fs.unlinkAsync(path))
    .then(function() {
        var fileInfo = {
            name: name,
            path: path,
            owner: req.user,
            total: total,
            minimum: minimum,
            time: moment.tz("Asia/Singapore").format(),
            description: description
        };
        return files.insertAsync(fileInfo);
    })
    .then(function() {
        return shares;
    });
};

exports.regen = function(shares, id) {
    exports.decrypt(shares, id)
    .then(function() {
        files.findOneAsync({ _id: id })
        .then(function(file) {
            var password = keygen.password();
            var shares = sssa.create(file.minimum, file.total, password);
            return encryptor.encryptFileAsync(file.path, path.join(file.path, ".dat"), password)
            .then(fs.unlinkAsync(path))
            .then(function() {
                return shares;
            });
        })
    })
}

exports.decrypt = function(shares, id) {
    var secret = sssa.combine(shares);
    return files.findOneAsync({ _id: id })
    .then(function(file) {
       return encryptor.decryptFileAsync(file.path, file.path.slice(0, -4), secret)
       .then(function() {
           return file;
       })
    });
}

exports.delete = function(user, id) {
    return files.findOneAsync({ _id: id })
    .then(function(file) {
        if (file.owner !== user) throw Error("Not owner");
        return fs.unlinkAsync(file.path)
        .then(files.removeAsync({ _id: id }));
    });
}