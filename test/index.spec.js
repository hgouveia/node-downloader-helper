const { DownloaderHelper } = require('../dist');
const { expect } = require('chai');

const downloadURL = 'http://ipv4.download.thinkbroadband.com/1GB.zip';
describe('DownloaderHelper', function () {

    describe('constructor', function () {

        it('should create a instance', function () {
            expect(function () {
                const dl = new DownloaderHelper(downloadURL, __dirname);
            }).to.not.throw();
        });

        it('should fail if url is not an string', function () {
            expect(function () {
                const dl = new DownloaderHelper(1234, __dirname);
            }).to.throw('URL should be an string');
        });

        it('should fail if url is empty', function () {
            expect(function () {
                const dl = new DownloaderHelper('', __dirname);
            }).to.throw("URL couldn't be empty");
        });

        it('should fail if destination folder is not an string', function () {
            expect(function () {
                const dl = new DownloaderHelper(downloadURL, {});
            }).to.throw('Destination Folder should be an string');
        });

        it('should fail if destination folder is empty', function () {
            expect(function () {
                const dl = new DownloaderHelper(downloadURL, '');
            }).to.throw("Destination Folder couldn't be empty");
        });

        it("should fail if destination folder doesn' exist", function () {
            expect(function () {
                const home = require('os').homedir();
                const nonExistingPath = home + '/dh_' + new Date().getTime();
                const dl = new DownloaderHelper(downloadURL, nonExistingPath);
            }).to.throw('Destination Folder must exist');
        });

    });
});