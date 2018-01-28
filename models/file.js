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
    var filePath = path.join(path.join(__dirname, "../"), req.file.path);
    var exp = req.body.expiration;
    exp = exp === 'N' ? false : exp.split(" ");
    // Generate key
    var password = keygen.password();
    var shares = sssa.create(minimum, total, password);
    // Encrypt File
    return encryptor.encryptFileAsync(filePath, filePath + ".dat", password)
    .then(function() {
        return fs.unlinkAsync(filePath);
    })
    .then(function() {
        var curTime = moment.tz("Asia/Singapore");
        var fileInfo = {
            name: name,
            path: filePath,
            owner: req.user.username,
            total: total,
            minimum: minimum,
            time: curTime.format(),
            expiration: exp ? curTime.add(exp[0], exp[1]).format() : exp,
            description: description
        };
        return files.insertAsync(fileInfo);
    })
    .then(function(file) {
        return [file._id, shares];
    });
};

exports.regenerate = function(user, shares, id) {
    return files.findOneAsync({ _id: id })
    .then(function(file) {
        if (file.owner !== user) throw Error("Not owner");
        return exports.decrypt(shares, id)
        .then(function() {
            var password = keygen.password();
            var shares = sssa.create(file.minimum, file.total, password);
            return encryptor.encryptFileAsync(file.path, file.path + ".dat", password)
            .then(function() {
                return fs.unlinkAsync(file.path);
            })
            .then(function() {
                console.log("New Shares:", shares);
                return shares;
            });
        });
    });
};

exports.decrypt = function(user, shares, id) {
    try {
        var secret = sssa.combine(shares);
    } catch (err) {
        return Promise.reject(err);
    }
    return files.findOneAsync({ _id: id })
    .then(function(file) {
        var expTime = file.expiration ? moment(file.expiration).tz("Asia/Singapore") : false;
        var curTime = moment().tz("Asia/Singapore");
        var isOwner = user ? user.username === file.owner : false;
        if (expTime && curTime.isAfter(expTime) && !isOwner) throw Error("File Expired");
        return encryptor.decryptFileAsync(file.path + ".dat", file.path, secret)
        .then(function() {
           return file;
        });
    });
};

exports.delete = function(user, id) {
    return files.findOneAsync({ _id: id })
    .then(function(file) {
        if (file.owner !== user) throw Error("Not owner");
        return fs.unlinkAsync(file.path + ".dat")
        .then(function() {
            return files.removeAsync({ _id: id });
        });
    });
};

exports.get = function(id) {
    return files.findOneAsync({ _id: id });
};

exports.getUserFiles = function(user) {
    return files.find({ 
       $where: function() {
           return this.owner === user;
       } 
    })
    .sort({ time: 1 })
    .execAsync()
    .then(function(ret) {
        return ret;
    });
};