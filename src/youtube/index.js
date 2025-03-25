
const { checkLatestUpload } = require('./youtubeNotifier');
const { checkLiveStream } = require('./youtubeLiveNotifier');

async function startYoutubeNotifier() {
    console.log('유튜브 알림 기능 시작!');

    await checkLatestUpload();
    await checkLiveStream();

    setInterval(async () => {
        await checkLatestUpload();
        await checkLiveStream();
    }, 5 * 60 * 1000); // 5분마다 실행
}

module.exports = { startYoutubeNotifier };
