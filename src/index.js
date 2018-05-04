import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as URL from 'url';

export const DH_STATES = {
    IDLE: 'IDLE',
    STARTED: 'STARTED',
    DOWNLOADING: 'DOWNLOADING',
    PAUSED: 'PAUSED',
    RESUMED: 'RESUMED',
    STOPPED: 'STOPPED',
    FINISHED: 'FINISHED',
    FAILED: 'FAILED'
}

export class DownloaderHelper extends EventEmitter {
    constructor(url, destFolder, header = {}) {
        super();

        if (!this.__validate(url, destFolder)) {
            return;
        }

        this.url = url;
        this.state = DH_STATES.IDLE;

        this.__total = 0;
        this.__downloaded = 0;
        this.__progress = 0;
        this.__states = DH_STATES;
        this.__header = header;
        this.__isResumed = false;
        this.__isResumable = false;
        this.__isRedirected = false;
        this.__statsEstimate = {
            time: 0,
            bytes: 0,
            prevBytes: 0
        };

        this.__options = this.__getOptions('GET', url, header);
        this.__fileName = path.basename(URL.parse(url).pathname);
        this.__filePath = path.join(destFolder, this.__fileName);
        this.__protocol = (url.indexOf('https://') > -1)
            ? https
            : http;
    }

    start() {
        return new Promise((resolve, reject) => {
            if (!this.__isRedirected) {
                this.emit('start');
                this.__setState(this.__states.STARTED);
            }
            this.__fileStream = fs.createWriteStream(this.__filePath,
                this.__isResumed ? { 'flags': 'a' } : {});
            this.__request = this.__protocol.request(this.__options, response => {
                //Stats
                if (!this.__isResumed) {
                    this.__total = response.headers['content-length'];
                    this.__downloaded = 0;
                    this.__progress = 0;
                }

                // Handle Redirects
                if (response.statusCode > 300 && response.statusCode < 400 &&
                    response.headers.hasOwnProperty('location') && response.headers.location) {
                    this.__isRedirected = true;
                    this.__initProtocol(response.headers.location);
                    this.__fileStream.close();
                    return this.start()
                        .then(() => resolve(true))
                        .catch(err => {
                            this.__setState(this.__states.FAILED);
                            this.emit('error', err);
                            reject(err);
                        });
                }

                // check if response is success
                if (response.statusCode !== 200 && response.statusCode !== 206) {
                    const err = new Error('Response status was ' + response.statusCode);
                    this.emit('error', err);
                    this.__fileStream.close();
                    fs.unlink(this.__filePath);
                    return reject(err);
                }

                if (response.headers.hasOwnProperty('accept-ranges') &&
                    response.headers['accept-ranges'] !== 'none') {
                    this.__isResumable = true;
                }

                // Start Downloading
                this.emit('download');
                this.__isResumed = false;
                this.__isRedirected = false;
                this.__setState(this.__states.DOWNLOADING);
                this.__statsEstimate.time = new Date();

                response.pipe(this.__fileStream);
                response.on('data', chunk => this.__calculateStats(chunk.length));

                this.__fileStream.on('finish', () => {
                    if (this.state !== this.__states.PAUSED) {
                        this.__setState(this.__states.FINISHED);
                        this.emit('end');
                    }
                    this.__fileStream.close();
                    return resolve(true);
                });
            });

            // Error Handling
            this.__request.on('error', err => {
                this.emit('error', err);
                this.__fileStream.close();
                this.__setState(this.__states.FAILED);
                fs.unlink(this.__filePath, () => reject(err));
            });

            this.__fileStream.on('error', err => {
                this.emit('error', err);
                this.__fileStream.close();
                this.__setState(this.__states.FAILED);
                fs.unlink(this.__filePath, () => reject(err));
            });

            this.__request.end();
        });
    }

    pause() {
        this.__setState(this.__states.PAUSED);
        this.__request.abort();
        this.__fileStream.close();
        this.emit('pause');
        return Promise.resolve(true);
    }

    resume() {
        this.__setState(this.__states.RESUMED);
        if (this.__isResumable) {
            this.__isResumed = true;
            this.__downloaded = this.__getFilesizeInBytes(this.__filePath);
            this.__options['headers']['range'] = 'bytes=' + (this.__downloaded - 1) + '-';
        }
        this.emit('resume');
        return this.start()
            .then(() => this.__isResumable);
    }

    stop() {
        this.__setState(this.__states.STOPPED);
        this.__request.abort();
        this.__fileStream.close();
        return new Promise((resolve, reject) => {
            fs.unlink(this.__filePath, _err => {
                if (_err) {
                    this.__setState(this.__states.FAILED);
                    this.emit('error', _err);
                    return reject(_err);
                }
                this.emit('stop');
                resolve(true);
            });
        });
    }

    __calculateStats(receivedBytes) {
        const currentTime = new Date();
        const elaspsedTime = currentTime - this.__statsEstimate.time;

        this.__downloaded += receivedBytes;
        this.__progress = (this.__downloaded / this.__total) * 100;

        // emit the progress every second
        if (elaspsedTime > 1000) {
            // Calculate the speed
            this.__statsEstimate.time = currentTime;
            this.__statsEstimate.bytes = this.__downloaded - this.__statsEstimate.prevBytes;
            this.__statsEstimate.prevBytes = this.__downloaded;

            this.emit('progress', {
                total: this.__total,
                downloaded: this.__downloaded,
                progress: this.__progress,
                speed: this.__statsEstimate.bytes
            });
        }
    }

    __setState(state) {
        this.state = state;
        this.emit('stateChanged', this.state);
    }

    __getOptions(method, url, header = {}) {
        let urlParse = URL.parse(url);
        let options = {
            protocol: urlParse.protocol,
            host: urlParse.host,
            port: urlParse.port,
            path: urlParse.path,
            method: method
        };

        if (header) {
            options['headers'] = header;
        }

        return options;
    }

    __getFilesizeInBytes(filePath) {
        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size;
        return fileSizeInBytes;
    }

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

        return true;
    }

    __initProtocol(url) {
        this.url = url;
        this.__options = this.__getOptions('GET', url, this.__header);
        this.__protocol = (url.indexOf('https://') > -1)
            ? https
            : http;
    }

}