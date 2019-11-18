'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.DownloaderHelper = exports.DH_STATES = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _fs = require('fs');

var fs = _interopRequireWildcard(_fs);

var _path = require('path');

var path = _interopRequireWildcard(_path);

var _http = require('http');

var http = _interopRequireWildcard(_http);

var _https = require('https');

var https = _interopRequireWildcard(_https);

var _url = require('url');

var URL = _interopRequireWildcard(_url);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var DH_STATES = exports.DH_STATES = {
    IDLE: 'IDLE',
    STARTED: 'STARTED',
    DOWNLOADING: 'DOWNLOADING',
    RETRY: 'RETRY',
    PAUSED: 'PAUSED',
    RESUMED: 'RESUMED',
    STOPPED: 'STOPPED',
    FINISHED: 'FINISHED',
    FAILED: 'FAILED'
};

var DownloaderHelper = exports.DownloaderHelper = function (_EventEmitter) {
    _inherits(DownloaderHelper, _EventEmitter);

    function DownloaderHelper(url, destFolder) {
        var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

        _classCallCheck(this, DownloaderHelper);

        var _this = _possibleConstructorReturn(this, (DownloaderHelper.__proto__ || Object.getPrototypeOf(DownloaderHelper)).call(this));

        if (!_this.__validate(url, destFolder)) {
            return _possibleConstructorReturn(_this);
        }

        _this.url = _this.requestURL = url;
        _this.state = DH_STATES.IDLE;
        _this.__defaultOpts = {
            retry: false,
            method: 'GET',
            headers: {},
            fileName: '',
            override: false,
            forceResume: false,
            httpRequestOptions: {},
            httpsRequestOptions: {}
        };

        _this.__pipes = [];
        _this.__total = 0;
        _this.__downloaded = 0;
        _this.__progress = 0;
        _this.__retryCount = 0;
        _this.__states = DH_STATES;
        _this.__opts = Object.assign({}, _this.__defaultOpts, options);
        _this.__headers = _this.__opts.headers;
        _this.__isResumed = false;
        _this.__isResumable = false;
        _this.__isRedirected = false;
        _this.__destFolder = destFolder;
        _this.__statsEstimate = {
            time: 0,
            bytes: 0,
            prevBytes: 0
        };
        _this.__fileName = '';
        _this.__filePath = '';
        _this.__options = _this.__getOptions(_this.__opts.method, url, _this.__opts.headers);
        _this.__initProtocol(url);
        return _this;
    }

    _createClass(DownloaderHelper, [{
        key: 'start',
        value: function start() {
            var _this2 = this;

            return new Promise(function (resolve, reject) {
                if (!_this2.__isRedirected && _this2.state !== _this2.__states.RESUMED) {
                    _this2.emit('start');
                    _this2.__setState(_this2.__states.STARTED);
                }

                _this2.__request = _this2.__downloadRequest(resolve, reject);

                _this2.__request.on('error', _this2.__onError(resolve, reject));
                _this2.__request.on('timeout', function () {
                    return _this2.emit('timeout');
                });

                _this2.__request.end();
            });
        }
    }, {
        key: 'pause',
        value: function pause() {
            if (this.__request) {
                this.__request.abort();
            }
            if (this.__fileStream) {
                this.__fileStream.close();
            }
            this.__setState(this.__states.PAUSED);
            this.emit('pause');
            return Promise.resolve(true);
        }
    }, {
        key: 'resume',
        value: function resume() {
            this.__setState(this.__states.RESUMED);
            if (this.__isResumable) {
                this.__isResumed = true;
                this.__downloaded = this.__getFilesizeInBytes(this.__filePath);
                this.__options['headers']['range'] = 'bytes=' + this.__downloaded + '-';
            }
            this.emit('resume');
            return this.start();
        }
    }, {
        key: 'stop',
        value: function stop() {
            var _this3 = this;

            if (this.__request) {
                this.__request.abort();
            }
            if (this.__fileStream) {
                this.__fileStream.close();
            }
            this.__setState(this.__states.STOPPED);
            return new Promise(function (resolve, reject) {
                fs.access(_this3.__filePath, function (_accessErr) {
                    if (_accessErr) {
                        _this3.emit('stop');
                        return resolve(true);
                    }

                    fs.unlink(_this3.__filePath, function (_err) {
                        if (_err) {
                            _this3.__setState(_this3.__states.FAILED);
                            _this3.emit('error', _err);
                            return reject(_err);
                        }
                        _this3.emit('stop');
                        resolve(true);
                    });
                });
            });
        }
    }, {
        key: 'pipe',
        value: function pipe(stream) {
            var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

            this.__pipes.push({ stream: stream, options: options });
            return this;
        }
    }, {
        key: 'getDownloadPath',
        value: function getDownloadPath() {
            return this.__filePath;
        }
    }, {
        key: 'isResumable',
        value: function isResumable() {
            return this.__isResumable;
        }
    }, {
        key: '__downloadRequest',
        value: function __downloadRequest(resolve, reject) {
            var _this4 = this;

            return this.__protocol.request(this.__options, function (response) {
                if (!_this4.__isResumed) {
                    _this4.__total = parseInt(response.headers['content-length']);
                    _this4.__resetStats();
                }

                if (response.statusCode > 300 && response.statusCode < 400 && response.headers.hasOwnProperty('location') && response.headers.location) {
                    _this4.__isRedirected = true;
                    _this4.__initProtocol(response.headers.location);

                    return _this4.start().then(function () {
                        return resolve(true);
                    }).catch(function (err) {
                        _this4.__setState(_this4.__states.FAILED);
                        _this4.emit('error', err);
                        return reject(err);
                    });
                }

                if (response.statusCode !== 200 && response.statusCode !== 206) {
                    var err = new Error('Response status was ' + response.statusCode);
                    err.status = response.statusCode || 0;
                    err.body = response.body || '';
                    _this4.emit('error', err);
                    return reject(err);
                }

                if (_this4.__opts.forceResume) {
                    _this4.__isResumable = true;
                } else if (response.headers.hasOwnProperty('accept-ranges') && response.headers['accept-ranges'] !== 'none') {
                    _this4.__isResumable = true;
                }

                _this4.__startDownload(response, resolve, reject);
            });
        }
    }, {
        key: '__startDownload',
        value: function __startDownload(response, resolve, reject) {
            var _this5 = this;

            if (!this.__isResumed) {
                var _fileName = this.__getFileNameFromHeaders(response.headers);
                this.__filePath = this.__getFilePath(_fileName);
                this.__fileName = this.__filePath.split(path.sep).pop();
                this.__fileStream = fs.createWriteStream(this.__filePath, {});
            } else {
                this.__fileStream = fs.createWriteStream(this.__filePath, { 'flags': 'a' });
            }

            this.emit('download');
            this.__isResumed = false;
            this.__isRedirected = false;
            this.__setState(this.__states.DOWNLOADING);
            this.__statsEstimate.time = new Date();

            response.pipe(this.__fileStream);
            response.on('data', function (chunk) {
                return _this5.__calculateStats(chunk.length);
            });

            this.__pipes.forEach(function (pipe) {
                return response.pipe(pipe.stream, pipe.options);
            });

            this.__fileStream.on('finish', this.__onFinished(resolve, reject));
            this.__fileStream.on('error', this.__onError(resolve, reject));
            response.on('error', this.__onError(resolve, reject));
        }
    }, {
        key: '__onFinished',
        value: function __onFinished(resolve, reject) {
            var _this6 = this;

            return function () {
                _this6.__fileStream.close(function (_err) {
                    if (_err) {
                        return reject(_err);
                    }
                    if (_this6.state !== _this6.__states.PAUSED && _this6.state !== _this6.__states.STOPPED) {
                        _this6.__setState(_this6.__states.FINISHED);
                        _this6.__pipes = [];
                        _this6.emit('end', {
                            fileName: _this6.__fileName,
                            filePath: _this6.__filePath,
                            totalSize: _this6.__total,
                            downloadedSize: _this6.__downloaded
                        });
                    }
                    return resolve(true);
                });
            };
        }
    }, {
        key: '__onError',
        value: function __onError(resolve, reject) {
            var _this7 = this;

            return function (err) {
                if (_this7.__fileStream) {
                    _this7.__fileStream.close(function () {
                        return fs.unlink(_this7.__filePath, function () {
                            return reject(err);
                        });
                    });
                }
                _this7.__pipes = [];
                _this7.__setState(_this7.__states.FAILED);
                _this7.emit('error', err);

                if (!_this7.__opts.retry) {
                    return reject(err);
                }

                return _this7.__retry().then(function () {
                    return resolve(true);
                }).catch(function (_err) {
                    return reject(_err ? _err : err);
                });
            };
        }
    }, {
        key: '__retry',
        value: function __retry() {
            var _this8 = this;

            if (!this.__opts.retry) {
                return Promise.reject();
            }

            if (_typeof(this.__opts.retry) !== 'object' || !this.__opts.retry.hasOwnProperty('maxRetries') || !this.__opts.retry.hasOwnProperty('delay')) {
                var _err = new Error('wrong retry options');
                this.__setState(this.__states.FAILED);
                this.emit('error', _err);
                return Promise.reject(_err);
            }

            if (this.__retryCount >= this.__opts.retry.maxRetries) {
                return Promise.reject();
            }

            this.__retryCount++;
            this.__setState(this.__states.RETRY);
            this.emit('retry', this.__retryCount, this.__opts.retry);

            return new Promise(function (resolve) {
                return setTimeout(function () {
                    return resolve(_this8.start());
                }, _this8.__opts.retry.delay);
            });
        }
    }, {
        key: '__resetStats',
        value: function __resetStats() {
            this.__retryCount = 0;
            this.__downloaded = 0;
            this.__progress = 0;
            this.__statsEstimate = {
                time: 0,
                bytes: 0,
                prevBytes: 0
            };
        }
    }, {
        key: '__getFileNameFromHeaders',
        value: function __getFileNameFromHeaders(headers) {
            var fileName = '';

            if (headers.hasOwnProperty('content-disposition') && headers['content-disposition'].indexOf('filename=') > -1) {

                fileName = headers['content-disposition'];
                fileName = fileName.trim();
                fileName = fileName.substr(fileName.indexOf('filename=') + 9);
                fileName = fileName.replace(new RegExp('"', 'g'), '');
            } else {
                fileName = path.basename(URL.parse(this.requestURL).pathname);
            }

            return this.__opts.fileName ? this.__getFileNameFromOpts(fileName) : fileName;
        }
    }, {
        key: '__getFilePath',
        value: function __getFilePath(fileName) {
            var currentPath = path.join(this.__destFolder, fileName);
            var filePath = currentPath;

            if (!this.__opts.override && this.state !== this.__states.RESUMED) {
                filePath = this.__uniqFileNameSync(filePath);

                if (currentPath !== filePath) {
                    this.emit('renamed', {
                        'path': filePath,
                        'fileName': filePath.split(path.sep).pop(),
                        'prevPath': currentPath,
                        'prevFileName': currentPath.split(path.sep).pop()
                    });
                }
            }

            return filePath;
        }
    }, {
        key: '__getFileNameFromOpts',
        value: function __getFileNameFromOpts(fileName) {

            if (!this.__opts.fileName) {
                return fileName;
            } else if (typeof this.__opts.fileName === 'string') {
                return this.__opts.fileName;
            } else if (typeof this.__opts.fileName === 'function') {
                var currentPath = path.join(this.__destFolder, fileName);
                return this.__opts.fileName(fileName, currentPath);
            } else if (_typeof(this.__opts.fileName) === 'object') {

                var fileNameOpts = this.__opts.fileName;
                var name = fileNameOpts.name;
                var ext = fileNameOpts.hasOwnProperty('ext') ? fileNameOpts.ext : false;

                if (typeof ext === 'string') {
                    return name + '.' + ext;
                } else if (typeof ext === 'boolean') {
                    if (ext) {
                        return name;
                    } else {
                        var _ext = fileName.split('.').pop();
                        return name + '.' + _ext;
                    }
                }
            }

            return fileName;
        }
    }, {
        key: '__calculateStats',
        value: function __calculateStats(receivedBytes) {
            var currentTime = new Date();
            var elaspsedTime = currentTime - this.__statsEstimate.time;

            if (!receivedBytes) {
                return;
            }

            this.__downloaded += receivedBytes;
            this.__progress = this.__downloaded / this.__total * 100;

            if (this.__downloaded === this.__total || elaspsedTime > 1000) {
                this.__statsEstimate.time = currentTime;
                this.__statsEstimate.bytes = this.__downloaded - this.__statsEstimate.prevBytes;
                this.__statsEstimate.prevBytes = this.__downloaded;
            }

            this.emit('progress', {
                total: this.__total,
                downloaded: this.__downloaded,
                progress: this.__progress,
                speed: this.__statsEstimate.bytes
            });
        }
    }, {
        key: '__setState',
        value: function __setState(state) {
            this.state = state;
            this.emit('stateChanged', this.state);
        }
    }, {
        key: '__getOptions',
        value: function __getOptions(method, url) {
            var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

            var urlParse = URL.parse(url);
            var options = {
                protocol: urlParse.protocol,
                host: urlParse.hostname,
                port: urlParse.port,
                path: urlParse.path,
                method: method
            };

            if (headers) {
                options['headers'] = headers;
            }

            return options;
        }
    }, {
        key: '__getFilesizeInBytes',
        value: function __getFilesizeInBytes(filePath) {
            var stats = fs.statSync(filePath);
            var fileSizeInBytes = stats.size;
            return fileSizeInBytes;
        }
    }, {
        key: '__validate',
        value: function __validate(url, destFolder) {

            if (typeof url !== 'string') {
                throw new Error('URL should be an string');
            }

            if (!url) {
                throw new Error("URL couldn't be empty");
            }

            if (typeof destFolder !== 'string') {
                throw new Error('Destination Folder should be an string');
            }

            if (!destFolder) {
                throw new Error("Destination Folder couldn't be empty");
            }

            if (!fs.existsSync(destFolder)) {
                throw new Error('Destination Folder must exist');
            }

            return true;
        }
    }, {
        key: '__initProtocol',
        value: function __initProtocol(url) {
            var defaultOpts = this.__getOptions(this.__opts.method, url, this.__headers);
            this.requestURL = url;

            if (url.indexOf('https://') > -1) {
                this.__protocol = https;
                this.__options = Object.assign({}, defaultOpts, this.__opts.httpsRequestOptions);
            } else {
                this.__protocol = http;
                this.__options = Object.assign({}, defaultOpts, this.__opts.httpRequestOptions);
            }
        }
    }, {
        key: '__uniqFileNameSync',
        value: function __uniqFileNameSync(path) {
            if (typeof path !== 'string' || path === '') {
                return path;
            }

            try {
                fs.accessSync(path, fs.F_OK);
                var pathInfo = path.match(/(.*)(\([0-9]+\))(\..*)$/);
                var base = pathInfo ? pathInfo[1].trim() : path;
                var suffix = pathInfo ? parseInt(pathInfo[2].replace(/\(|\)/, '')) : 0;
                var ext = path.split('.').pop();

                if (ext !== path) {
                    ext = '.' + ext;
                    base = base.replace(ext, '');
                } else {
                    ext = '';
                }

                return this.__uniqFileNameSync(base + ' (' + ++suffix + ')' + ext);
            } catch (err) {
                return path;
            }
        }
    }]);

    return DownloaderHelper;
}(_events.EventEmitter);
