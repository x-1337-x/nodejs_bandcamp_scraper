const fs = require('fs');
const https = require('https');
const entities = require('html-entities');
const cliProgress = require('cli-progress');

const url = process.argv[2];

const multibar = new cliProgress.MultiBar(
	{
		clearOnComplete: false,
		hideCursor: false,
		format: '{bar} {filename}, {percentage}%',
	},
	cliProgress.Presets.shades_grey
);

const downloadFile = (url, name, destination, bar) => {
	if (fs.existsSync(destination)) {
		console.log(`skipping ${destination}, it already exists`);
		return;
	}

	let receivedBytes = 0;

	const writable = fs.createWriteStream(destination, {
		encoding: 'binary',
	});

	const req = https.request(url, (res) => {
		const totalBytes = res.headers['content-length'];
		res.on('data', function (chunk) {
			receivedBytes += chunk.byteLength;
			const progress = Math.round((receivedBytes / totalBytes) * 100);

			bar.update(progress, { filename: `${name}` });

			if (progress === 100) multibar.stop();
		});
		res.pipe(writable);
	});

	req.on('error', (error) => {
		console.error(error);
	});

	req.end();
};

const JSON_STRING_RE = /data-tralbum="([^"]*)"/;
const COVER_IMG_RE = /<a class="popupImage" href="([^"]*)"/;

const getPageSource = () =>
	new Promise((resolve, reject) => {
		let html = '';

		const req = https.request(url, (res) => {
			res.on('data', (chunk) => {
				html += chunk;
			});
			res.on('end', () => {
				resolve(html);
			});
		});

		req.on('error', (error) => {
			reject(error);
		});

		req.end();
	});

getPageSource().then((data) => {
	const result = JSON_STRING_RE.exec(data);
	const jsonString = entities.decode(result[1]);
	const json = JSON.parse(jsonString);

	const coverImgUrl = COVER_IMG_RE.exec(data)[1];

	const albumTitle = json.current['title'];
	const trackList = [];

	json.trackinfo.forEach((el) =>
		trackList.push({
			trackName: el.title,
			url: el.file['mp3-128'],
		})
	);

	fs.mkdirSync(`${albumTitle}`, { recursive: true }, (err) => {
		if (err) {
			throw err;
		}
	});

	if (trackList.length > 0) {
		trackList.forEach((el) => {
			const bar = multibar.create(100, 0, { filename: `${el.trackName}` });
			downloadFile(
				el.url,
				el.trackName,
				`${albumTitle}/${el.trackName}.mp3`,
				bar
			);
		});
	}

	if (coverImgUrl) {
		const bar = multibar.create(100, 0, { filename: 'cover' });
		downloadFile(coverImgUrl, 'cover', `${albumTitle}/cover.jpg`, bar);
	}
});
