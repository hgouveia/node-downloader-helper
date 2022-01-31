import * as fs from 'fs';
import * as legacyUrl from 'url';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';

export const DH_STATES = {
    IDLE: 'IDLE',
    SKIPPED: 'SKIPPED',
    STARTED: 'STARTED',
    DOWNLOADING: 'DOWNLOADING',
    RETRY: 'RETRY',
    PAUSED: 'PAUSED',
    RESUMED: 'RESUMED',
    STOPPED: 'STOPPED',
    FINISHED: 'FINISHED',
    FAILED: 'FAILED'
};

export class DownloaderHelper extends EventEmitter {

    /**
     * Creates an instance of DownloaderHelper.
     * @param {String} url
     * @param {String} destFolder
     * @param {Object} [options={}]
     * @memberof DownloaderHelper
     */
    constructor(url, destFolder, options = {}) {
        super();

        if (!this.__validate(url, destFolder)) {
            return;
        }

        this.url = this.requestURL = url;
        this.state = DH_STATES.IDLE;
        this.__defaultOpts = {
            retry: false, // { maxRetries: 3, delay: 3000 }
            method: 'GET',
            headers: {},
            fileName: '',
            override: false, // { skip: false, skipSmaller: false }
            forceResume: false,
            removeOnStop: true,
            removeOnFail: true,
            progressThrottle: 1000,
            httpRequestOptions: {},
            httpsRequestOptions: {}
        };
        this.__opts = Object.assign({}, this.__defaultOpts);
        this.__pipes = [];
        this.__total = 0;
        this.__downloaded = 0;
        this.__progress = 0;
        this.__retryCount = 0;
        this.__states = DH_STATES;
        this.__promise = null;
        this.__request = null;
        this.__response = null;
        this.__isResumed = false;
        this.__isResumable = false;
        this.__isRedirected = false;
        this.__destFolder = destFolder;
        this.__statsEstimate = {
            time: 0,
            bytes: 0,
            prevBytes: 0,
            throttleTime: 0,
        };
        this.__fileName = '';
        this.__filePath = '';
        this.updateOptions(options);
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    start() {
        return new Promise((resolve, reject) => {
            this.__promise = { resolve, reject };
            this.__start();
        });
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    pause() {
        this.__requestAbort();

        if (this.__response) {
            this.__response.unpipe();
            this.__pipes.forEach(pipe => pipe.stream.unpipe());
        }

        if (this.__fileStream) {
            this.__fileStream.removeAllListeners();
        }

        return this.__closeFileStream().then(() => {
            this.__setState(this.__states.PAUSED);
            this.emit('pause');
            return true;
        });
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    resume() {
        this.__setState(this.__states.RESUMED);
        if (this.__isResumable) {
            this.__isResumed = true;
            this.__options['headers']['range'] = 'bytes=' + this.__downloaded + '-';
        }
        this.emit('resume', this.__isResumed);
        return this.__start();
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    stop() {
        const emitStop = () => {
            this.__resolvePending();
            this.__setState(this.__states.STOPPED);
            this.emit('stop');
        };
        const removeFile = () => new Promise((resolve, reject) => {
            fs.access(this.__filePath, _accessErr => {
                // if can't access, probably is not created yet
                if (_accessErr) {
                    emitStop();
                    return resolve(true);
                }

                fs.unlink(this.__filePath, _err => {
                    if (_err) {
                        this.__setState(this.__states.FAILED);
                        this.emit('error', _err);
                        return reject(_err);
                    }
                    emitStop();
                    resolve(true);
                });
            });
        });

        this.__requestAbort();

        return this.__closeFileStream().then(() => {
            if (this.__opts.removeOnStop) {
                return removeFile();
            }
            emitStop();
            return Promise.resolve(true);
        });
    }

    /**
     * Add pipes to the pipe list that will be applied later when the download starts
     * @url https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options
     * @param {stream.Readable} stream https://nodejs.org/api/stream.html#stream_class_stream_readable
     * @param {Object} [options=null]
     * @returns {stream.Readable}
     * @memberof DownloaderHelper
     */
    pipe(stream, options = null) {
        this.__pipes.push({ stream, options });
        return stream;
    }

    /**
     * Unpipe an stream , if a stream is not specified, then all pipes are detached.
     *
     * @url https://nodejs.org/api/stream.html#stream_readable_unpipe_destination
     * @param {stream.Readable} [stream=null]
     * @returns
     * @memberof DownloaderHelper
     */
    unpipe(stream = null) {
        const unpipeStream = _stream => (this.__response)
            ? this.__response.unpipe(_stream)
            : _stream.unpipe();


        if (stream) {
            const pipe = this.__pipes.find(p => p.stream === stream);
            if (pipe) {
                unpipeStream(stream);
                this.__pipes = this.__pipes.filter(p => p.stream !== stream);
            }
            return;
        }

        this.__pipes.forEach(p => unpipeStream(p.stream));
        this.__pipes = [];
    }

    /**
     * Where the download will be saved
     *
     * @returns {String}
     * @memberof DownloaderHelper
     */
    getDownloadPath() {
        return this.__filePath;
    }

    /**
     * Indicates if the download can be resumable (available after the start phase)
     *
     * @returns {Boolean}
     * @memberof DownloaderHelper
     */
    isResumable() {
        return this.__isResumable;
    }


    /**
     * Updates the options, can be use on pause/resume events
     *
     * @param {Object} [options={}]
     * @memberof DownloaderHelper
     */
    updateOptions(options) {
        this.__opts = Object.assign({}, this.__opts, options);
        this.__headers = this.__opts.headers;

        // validate the progressThrottle, if invalid, use the default
        if (typeof this.__opts.progressThrottle !== 'number' || this.__opts.progressThrottle < 0) {
            this.__opts.progressThrottle = this.__defaultOpts.progressThrottle;
        }

        this.__options = this.__getOptions(this.__opts.method, this.url, this.__opts.headers);
        this.__initProtocol(this.url);
    }

    /**
     * Current download progress stats
     *
     * @returns {Stats}
     * @memberof DownloaderHelper
     */
    getStats() {
        return {
            total: this.__total,
            name: this.__fileName,
            downloaded: this.__downloaded,
            progress: this.__progress,
            speed: this.__statsEstimate.bytes
        };
    }

    /**
     * Gets the total file size from the server
     *
     * @returns {Promise<{name:string, total:number}>}
     * @memberof DownloaderHelper
     */
    getTotalSize() {
        const options = this.__getOptions('HEAD', this.url, this.__headers);
        return new Promise((resolve, reject) => {
            const request = this.__protocol.request(options, response => {
                if (this.__isRequireRedirect(response)) {
                    const redirectedURL = legacyUrl.resolve(this.url, response.headers.location);
                    const options = this.__getOptions('HEAD', redirectedURL, this.__headers);
                    const request = this.__protocol.request(options, response => {
                        if (response.statusCode !== 200) {
                            reject(new Error(`Response status was ${response.statusCode}`));
                        }
                        resolve({
                            name: this.__getFileNameFromHeaders(response.headers, response),
                            total: parseInt(response.headers['content-length'] || 0)
                        });
                    })
                    request.end();
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`Response status was ${response.statusCode}`));
                }
                resolve({
                    name: this.__getFileNameFromHeaders(response.headers, response),
                    total: parseInt(response.headers['content-length'] || 0)
                });
            });
            request.end();
        });
    }

    __start() {
        if (!this.__isRedirected &&
            this.state !== this.__states.RESUMED) {
            this.emit('start');
            this.__setState(this.__states.STARTED);
        }

        // Start the Download
        this.__response = null;
        this.__request = this.__downloadRequest(this.__promise.resolve, this.__promise.reject);

        // Error Handling
        this.__request.on('error', this.__onError(this.__promise.resolve, this.__promise.reject));
        this.__request.on('timeout', this.__onTimeout(this.__promise.resolve, this.__promise.reject));
        this.__request.on('uncaughtException', this.__onError(this.__promise.resolve, this.__promise.reject, true));

        this.__request.end();
    }

    /**
     * Resolve pending promises from Start method
     *
     * @memberof DownloaderHelper
     */
    __resolvePending() {
        if (!this.__promise) {
            return;
        }
        const { resolve } = this.__promise;
        this.__promise = null;
        return resolve(true);
    }

    /**
     *
     *
     * @param {Promise.resolve} resolve
     * @param {Promise.reject} reject
     * @returns {http.ClientRequest}
     * @memberof DownloaderHelper
     */
    __downloadRequest(resolve, reject) {
        return this.__protocol.request(this.__options, response => {
            this.__response = response;

            //Stats
            if (!this.__isResumed) {
                this.__total = parseInt(response.headers['content-length']);
                this.__resetStats();
            }

            // Handle Redirects
            if (this.__isRequireRedirect(response)) {
                const redirectedURL = legacyUrl.resolve(this.url, response.headers.location);
                this.__isRedirected = true;
                this.__initProtocol(redirectedURL);
                return this.__start();
            }

            // check if response wans't a success
            if (response.statusCode !== 200 && response.statusCode !== 206) {
                const err = new Error(`Response status was ${response.statusCode}`);
                err.status = response.statusCode || 0;
                err.body = response.body || '';
                this.__setState(this.__states.FAILED);
                this.emit('error', err);
                return reject(err);
            }

            if (this.__opts.forceResume) {
                this.__isResumable = true;
            } else if (response.headers.hasOwnProperty('accept-ranges') &&
                response.headers['accept-ranges'] !== 'none') {
                this.__isResumable = true;
            }

            this.__startDownload(response, resolve, reject);
        });
    }

    /**
     *
     *
     * @param {http.IncomingMessage} response
     * @param {Promise.resolve} resolve
     * @param {Promise.reject} reject
     * @memberof DownloaderHelper
     */
    __startDownload(response, resolve, reject) {
        let readable = response;

        if (!this.__isResumed) {
            const _fileName = this.__getFileNameFromHeaders(response.headers);
            this.__filePath = this.__getFilePath(_fileName);
            this.__fileName = this.__filePath.split(path.sep).pop();
            if (fs.existsSync(this.__filePath)) {
                const downloadedSize = this.__getFilesizeInBytes(this.__filePath);
                if (typeof this.__opts.override === 'object' &&
                    this.__opts.override.skip && (
                        this.__opts.override.skipSmaller ||
                        downloadedSize >= this.__total)) {
                    this.emit('skip', {
                        totalSize: this.__total,
                        fileName: this.__fileName,
                        filePath: this.__filePath,
                        downloadedSize: downloadedSize
                    });
                    this.__setState(this.__states.SKIPPED);
                    return resolve(true);
                }
            }
            this.__fileStream = fs.createWriteStream(this.__filePath, {});
        } else {
            this.__fileStream = fs.createWriteStream(this.__filePath, { 'flags': 'a' });
        }

        // Start Downloading
        this.emit('download', {
            fileName: this.__fileName,
            filePath: this.__filePath,
            totalSize: this.__total,
            isResumed: this.__isResumed,
            downloadedSize: this.__downloaded
        });
        this.__retryCount = 0;
        this.__isResumed = false;
        this.__isRedirected = false;
        this.__setState(this.__states.DOWNLOADING);
        this.__statsEstimate.time = new Date();
        this.__statsEstimate.throttleTime = new Date();

        // Add externals pipe
        readable.on('data', chunk => this.__calculateStats(chunk.length));
        this.__pipes.forEach(pipe => {
            readable.pipe(pipe.stream, pipe.options);
            readable = pipe.stream;
        });
        readable.pipe(this.__fileStream);
        readable.on('error', this.__onError(resolve, reject));

        this.__fileStream.on('finish', this.__onFinished(resolve, reject));
        this.__fileStream.on('error', this.__onError(resolve, reject));
    }


    /**
     *
     *
     * @returns
     * @memberof DownloaderHelper
     */
    __hasFinished() {
        return (this.state !== this.__states.PAUSED &&
            this.state !== this.__states.STOPPED &&
            this.state !== this.__states.RETRY &&
            this.state !== this.__states.FAILED);
    }


    /**
     *
     *
     * @param {IncomingMessage} response
     * @returns {Boolean}
     * @memberof DownloaderHelper
     */
    __isRequireRedirect(response) {
        return (response.statusCode > 300 &&
            response.statusCode < 400 &&
            response.headers.hasOwnProperty('location') &&
            response.headers.location);
    }

    /**
    *
    *
    * @param {Promise.resolve} resolve
    * @param {Promise.reject} reject
    * @returns {Function}
    * @memberof DownloaderHelper
    */
    __onFinished(resolve, reject) {
        return () => {
            this.__fileStream.close(_err => {
                if (_err) {
                    return reject(_err);
                }
                if (this.__hasFinished()) {
                    this.__setState(this.__states.FINISHED);
                    this.__pipes = [];
                    this.emit('end', {
                        fileName: this.__fileName,
                        filePath: this.__filePath,
                        totalSize: this.__total,
                        incomplete: this.__downloaded !== this.__total,
                        onDiskSize: this.__getFilesizeInBytes(this.__filePath),
                        downloadedSize: this.__downloaded,
                    });
                }
                return resolve(this.__downloaded === this.__total);
            });
        };
    }

    /**
     *
     *
     * @returns
     * @memberof DownloaderHelper
     */
    __closeFileStream() {
        if (!this.__fileStream) {
            return Promise.resolve(true);
        }
        return new Promise((resolve, reject) => {
            this.__fileStream.close(err => {
                if (err) {
                    return reject(err);
                }
                return resolve(true);
            });
        });
    }

    /**
     *
     * @param {Promise.resolve} resolve
     * @param {Promise.reject} reject
     * @param {boolean} abortReq
     * @returns {Function}
     * @memberof DownloaderHelper
     */
    __onError(resolve, reject, abortReq = false) {
        return err => {
            this.__pipes = [];

            if (abortReq) {
                this.__requestAbort();
            }

            if (this.state === this.__states.STOPPED ||
                this.state === this.__states.FAILED) {
                return;
            }

            if (!this.__opts.retry) {
                return this.__removeFile().then(() => {
                    this.__setState(this.__states.FAILED);
                    this.emit('error', err);
                    reject(err);
                });
            }
            return this.__retry(err)
                .catch(_err => {
                    this.__removeFile().then(() => {
                        this.__setState(this.__states.FAILED);
                        this.emit('error', _err ? _err : err);
                        reject(_err ? _err : err);
                    });
                });
        };
    }

    /**
     *
     *
     * @returns {Promise<boolean>}
     * @memberof DownloaderHelper
     */
    __retry(err = null) {
        if (!this.__opts.retry) {
            return Promise.reject(err);
        }

        if (typeof this.__opts.retry !== 'object' ||
            !this.__opts.retry.hasOwnProperty('maxRetries') ||
            !this.__opts.retry.hasOwnProperty('delay')) {
            return Promise.reject(new Error('wrong retry options'));
        }

        // reached the maximum retries
        if (this.__retryCount >= this.__opts.retry.maxRetries) {
            return Promise.reject(err ? err : new Error('reached the maximum retries'));
        }

        this.__retryCount++;
        this.__setState(this.__states.RETRY);
        this.emit('retry', this.__retryCount, this.__opts.retry, err);

        return new Promise((resolve) =>
            setTimeout(() => resolve(this.__downloaded > 0 ? this.resume() : this.__start()), this.__opts.retry.delay)
        );
    }

    /**
     *
     * @param {Promise.resolve} resolve
     * @param {Promise.reject} reject
     * @returns {Function}
     * @memberof DownloaderHelper
     */
    __onTimeout(resolve, reject) {
        return () => {
            this.__requestAbort();

            if (!this.__opts.retry) {
                return this.__removeFile().then(() => {
                    this.__setState(this.__states.FAILED);
                    this.emit('timeout');
                    reject(new Error('timeout'));
                });
            }

            return this.__retry(new Error('timeout'))
                .catch(_err => {
                    this.__removeFile().then(() => {
                        this.__setState(this.__states.FAILED);
                        if (_err) {
                            reject(_err);
                        } else {
                            this.emit('timeout');
                            reject(new Error('timeout'));
                        }
                    });
                });
        };
    }

    /**
     *
     *
     * @memberof DownloaderHelper
     */
    __resetStats() {
        this.__retryCount = 0;
        this.__downloaded = 0;
        this.__progress = 0;
        this.__statsEstimate = {
            time: 0,
            bytes: 0,
            prevBytes: 0
        };
    }

    /**
     *
     *
     * @param {Object} headers
     * @returns {String}
     * @memberof DownloaderHelper
     */
    __getFileNameFromHeaders(headers, response) {
        let fileName = '';

        const fileNameAndEncodingRegExp = /.*filename\*=.*?''([^"].+?[^"])(?:(?:;)|$)/i // match everything after the specified encoding behind a case-insensitive `filename*=`
        const fileNameWithQuotesRegExp = /.*filename="(.*?)";?/i // match everything inside the quotes behind a case-insensitive `filename=`
        const fileNameWithoutQuotesRegExp = /.*filename=([^"].+?[^"])(?:(?:;)|$)/i // match everything immediately after `filename=` that isn't surrounded by quotes and is followed by either a `;` or the end of the string
        
        const ContentDispositionHeaderExists = headers.hasOwnProperty('content-disposition')
        const fileNameAndEncodingMatch = !ContentDispositionHeaderExists ? null : headers['content-disposition'].match(fileNameAndEncodingRegExp)
        const fileNameWithQuotesMatch = (!ContentDispositionHeaderExists || fileNameAndEncodingMatch) ? null : headers['content-disposition'].match(fileNameWithQuotesRegExp)
        const fileNameWithoutQuotesMatch = (!ContentDispositionHeaderExists || fileNameAndEncodingMatch || fileNameWithQuotesMatch) ? null : headers['content-disposition'].match(fileNameWithoutQuotesRegExp)

        // Get Filename
        if (ContentDispositionHeaderExists && (fileNameAndEncodingMatch || fileNameWithQuotesMatch || fileNameWithoutQuotesMatch)) {

            fileName = headers['content-disposition'];
            fileName = fileName.trim();

            if (fileNameAndEncodingMatch) {
                fileName = fileNameAndEncodingMatch[1];
            } else if (fileNameWithQuotesMatch) {
                fileName = fileNameWithQuotesMatch[1];
            } else if (fileNameWithoutQuotesMatch) {
                fileName = fileNameWithoutQuotesMatch[1];
            }
            
            fileName = fileName.replace(/[/\\]/g, '');

        } else {

            if (path.basename(legacyUrl.parse(this.requestURL).pathname).length > 0) {
                fileName = path.basename(legacyUrl.parse(this.requestURL).pathname);
            } else {
                fileName = `${legacyUrl.parse(this.requestURL).hostname}.html`;
            }
        }

        return (
            (this.__opts.fileName)
                ? this.__getFileNameFromOpts(fileName, response)
                : fileName.replace(/\.*$/, '') // remove any potential trailing '.' (just to be sure)
        )
    }

    /**
     *
     *
     * @param {String} fileName
     * @returns {String}
     * @memberof DownloaderHelper
     */
    __getFilePath(fileName) {
        const currentPath = path.join(this.__destFolder, fileName);
        let filePath = currentPath;

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


    /**
     *
     *
     * @param {String} fileName
     * @returns {String}
     * @memberof DownloaderHelper
     */
    __getFileNameFromOpts(fileName, response) {

        if (!this.__opts.fileName) {
            return fileName;
        } else if (typeof this.__opts.fileName === 'string') {
            return this.__opts.fileName;
        } else if (typeof this.__opts.fileName === 'function') {
            const currentPath = path.join(this.__destFolder, fileName);
            if ((response && response.headers) || (this.__response && this.__response.headers)) {
                return this.__opts.fileName(fileName, currentPath, (response ? response : this.__response).headers['content-type']);
            } else {
                return this.__opts.fileName(fileName, currentPath);
            }
        } else if (typeof this.__opts.fileName === 'object') {

            const fileNameOpts = this.__opts.fileName;  // { name:string, ext:true|false|string}
            const name = fileNameOpts.name;
            const ext = fileNameOpts.hasOwnProperty('ext')
                ? fileNameOpts.ext : false;

            if (typeof ext === 'string') {
                return `${name}.${ext}`;
            } else if (typeof ext === 'boolean') {
                // true: use the 'name' as full file name
                // false (default) only replace the name
                if (ext) {
                    return name;
                } else {
                    const _ext = fileName.includes('.') ? fileName.split('.').pop() : ''; // make sure there is a '.' in the fileName string
                    return _ext !== '' ? `${name}.${_ext}` : name; // if there is no extension, replace the whole file name
                }
            }
        }

        return fileName;
    }

    /**
     *
     *
     * @param {Number} receivedBytes
     * @memberof DownloaderHelper
     */
    __calculateStats(receivedBytes) {
        const currentTime = new Date();
        const elaspsedTime = currentTime - this.__statsEstimate.time;
        const throttleElapseTime = currentTime - this.__statsEstimate.throttleTime;

        if (!receivedBytes) {
            return;
        }

        this.__downloaded += receivedBytes;
        this.__progress = (this.__downloaded / this.__total) * 100;

        // Calculate the speed every second or if finished
        if (this.__downloaded === this.__total || elaspsedTime > 1000) {
            this.__statsEstimate.time = currentTime;
            this.__statsEstimate.bytes = this.__downloaded - this.__statsEstimate.prevBytes;
            this.__statsEstimate.prevBytes = this.__downloaded;
        }

        if (this.__downloaded === this.__total || throttleElapseTime > this.__opts.progressThrottle) {
            this.__statsEstimate.throttleTime = currentTime;
            this.emit('progress.throttled', this.getStats());
        }

        // emit the progress
        this.emit('progress', this.getStats());
    }

    /**
     *
     *
     * @param {String} state
     * @memberof DownloaderHelper
     */
    __setState(state) {
        this.state = state;
        this.emit('stateChanged', this.state);
    }

    /**
     *
     *
     * @param {String} method
     * @param {String} url
     * @param {Object} [headers={}]
     * @returns {Object}
     * @memberof DownloaderHelper
     */
    __getOptions(method, url, headers = {}) {
        const urlParse = legacyUrl.parse(url);
        const options = {
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

    /**
     *
     *
     * @param {String} filePath
     * @returns {Number}
     * @memberof DownloaderHelper
     */
    __getFilesizeInBytes(filePath) {
        const stats = fs.statSync(filePath, false);
        const fileSizeInBytes = stats.size || 0;
        return fileSizeInBytes;
    }

    /**
     *
     *
     * @param {String} url
     * @param {String} destFolder
     * @returns {Boolean|Error}
     * @memberof DownloaderHelper
     */
    __validate(url, destFolder) {

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

        const stats = fs.statSync(destFolder);
        if (!stats.isDirectory()) {
            throw new Error('Destination Folder must be a directory');
        }

        try {
            fs.accessSync(destFolder, fs.constants.W_OK);
        } catch (e) {
            throw new Error('Destination Folder must be writable');
        }

        return true;
    }

    /**
     *
     *
     * @param {String} url
     * @memberof DownloaderHelper
     */
    __initProtocol(url) {
        const defaultOpts = this.__getOptions(this.__opts.method, url, this.__headers);
        this.requestURL = url;

        if (url.indexOf('https://') > -1) {
            this.__protocol = https;
            this.__options = Object.assign({}, defaultOpts, this.__opts.httpsRequestOptions);
        } else {
            this.__protocol = http;
            this.__options = Object.assign({}, defaultOpts, this.__opts.httpRequestOptions);
        }

    }

    /**
     *
     *
     * @param {String} path
     * @returns {String}
     * @memberof DownloaderHelper
     */
    __uniqFileNameSync(path) {
        if (typeof path !== 'string' || path === '') {
            return path;
        }

        try {
            // if access fail, the file doesnt exist yet
            fs.accessSync(path, fs.F_OK);
            const pathInfo = path.match(/(.*)(\([0-9]+\))(\..*)$/);
            let base = pathInfo ? pathInfo[1].trim() : path;
            let suffix = pathInfo ? parseInt(pathInfo[2].replace(/\(|\)/, '')) : 0;
            let ext = path.split('.').pop();

            if (ext !== path && ext.length > 0) {
                ext = '.' + ext;
                base = base.replace(ext, '');
            } else {
                ext = '';
            }

            // generate a new path until it doesn't exist
            return this.__uniqFileNameSync(base + ' (' + (++suffix) + ')' + ext);
        } catch (err) {
            return path;
        }
    }

    /**
     *
     *
     * @returns {Promise<void>}
     * @memberof DownloaderHelper
     */
    __removeFile() {
        return new Promise(resolve => {
            if (!this.__fileStream) {
                return resolve();
            }
            this.__fileStream.close(() => {
                if (this.__opts.removeOnFail) {
                    return fs.unlink(this.__filePath, () => resolve());
                }
                resolve();
            });
        });
    }

    /**
     *
     *
     * @memberof DownloaderHelper
     */
    __requestAbort() {
        if (this.__response) {
            this.__response.destroy();
        }

        if (this.__request) {
            // from node => v13.14.X
            if (this.__request.destroy) {
                this.__request.destroy();
            } else {
                this.__request.abort();
            }
        }
    }
}
