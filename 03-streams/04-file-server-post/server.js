const url = require('url');
const http = require('http');
const path = require('path');
const LimitSizeStream = require('./LimitSizeStream');
const fs = require('fs');

const server = new http.Server();

server.on('request', (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);
	const pathname = url.pathname.slice(1);

	const filepath = path.join(__dirname, 'files', pathname);

	switch (req.method) {
		case 'POST':
				try {
					if (/\//.test(pathname)) {
						res.statusCode = 400;
						res.end('nested path is not supported');
						return;
					}

					const limitedStream = new LimitSizeStream({
						limit: 1048576,
						encoding: 'utf-8',
					});

					fs.promises.mkdir('files', {
						recursive: true
					});

					(async () => {
						try {
							if (!pathname) {
								res.statusCode = 400;
								res.end('filename is required');
								return;
							}
							await fs.promises.access(filepath, fs.constants.F_OK)
								.then(() => {
									res.statusCode = 409;
									res.end('file already exists');
								})
						} catch {
							const outStream = fs.createWriteStream(filepath);

							req.pipe(limitedStream).pipe(outStream);

							outStream.on('finish', () => {
								res.statusCode = 201;
								res.end();
							});

							limitedStream.on('error', (error) => {
								if (error.code === 'LIMIT_EXCEEDED') {
									outStream.destroy();
						            fs.rm(filepath, {force: true}, () => {
										res.statusCode = 413;
										res.end('file is too large');
						            });
								} else {
									res.statusCode = 500;
									res.end('internal error');
								}
							});

							req.on('aborted', () => {
								limitedStream.destroy();
								outStream.destroy();
								fs.rm(filepath, {force: true}, () => {});
							});
						}
					})();
				} catch (err) {
					res.statusCode = 500;
					res.end('internal error');
				}
			break;

		default:
			res.statusCode = 501;
			res.end('Not implemented');
	}
});

module.exports = server;
