const { DownloadHelper } = require('../dist');
const { expect } = require('chai');

const downloadURL = 'http://ipv4.download.thinkbroadband.com/1GB.zip';
describe('DownloadHelper', function () {

    describe('constructor', function () {

        it('should fail if url is not an string', function () {
            expect(function () {
                const dl = new DownloadHelper(1234, __dirname);
            }).to.throw('URL should be an string');
        });

        it('should fail if url is empty', function () {
            expect(function () {
                const dl = new DownloadHelper('', __dirname);
            }).to.throw("URL couldn't be empty");
        });

        it('should fail if destination folder is not an string', function () {
            expect(function () {
                const dl = new DownloadHelper(downloadURL, {});
            }).to.throw('Destination Folder should be an string');
        });

        it('should fail if destination folder is empty', function () {
            expect(function () {
                const dl = new DownloadHelper(downloadURL, '');
            }).to.throw("Destination Folder couldn't be empty");
        });

        it("should fail if destination folder doesn' exist", function () {
            expect(function () {
                const dl = new DownloadHelper(downloadURL, 'Z:/download');
            }).to.throw('Destination Folder must exist');
        });

    });
});