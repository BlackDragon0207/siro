
const { checkLatestVideoAndShorts } = require('./youtubeNotifier');
const { checkLiveStream } = require('./youtubeLiveNotifier');

async function startYoutubeNotifier() {
    console.log('유튜브 알림 기능 시작!');

    await checkLatestVideoAndShorts();
    await checkLiveStream();

    setInterval(async () => {
        await checkLatestVideoAndShorts();
        await checkLiveStream();
    }, 5 * 60 * 1000); // 5분마다 실행
}

module.exports = { startYoutubeNotifier };
