const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_KEYS = process.env.YOUTUBE_API_KEYS.split(','); // 여러 개의 API 키
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBHOOK_URL = process.env.DISCORD_LIVE_WEBHOOK;
const LIVE_INFO_PATH = path.join(__dirname, '../../liveInfo.json');

let currentApiKeyIndex = 0;

async function getApiKey() {
    return API_KEYS[currentApiKeyIndex];
}

async function switchApiKey() {
    currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
    console.warn(`🚨 API 할당량 초과! 다음 API 키로 전환: ${currentApiKeyIndex + 1}/${API_KEYS.length}`);
}

async function fetchWithRetry(url) {
    for (let i = 0; i < API_KEYS.length; i++) {
        try {
            const apiKey = getApiKey();
            const response = await axios.get(url.replace('{API_KEY}', apiKey));
            return response;
        } catch (error) {
            if (error.response?.status === 403) {
                switchApiKey();
            } else {
                throw error;
            }
        }
    }
    throw new Error('❌ 모든 API 키의 할당량이 초과되었습니다.');
}

async function checkLiveStream() {
    try {
        // 1️⃣ 최신 5개의 영상 조회
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?key={API_KEY}&channelId=${CHANNEL_ID}&part=id&order=date&type=video&maxResults=5`;
        const searchResponse = await fetchWithRetry(searchUrl);
        
        const videoIds = searchResponse.data.items.map(video => video.id.videoId);
        if (videoIds.length === 0) return;

        // 2️⃣ 영상 상태 조회 (live 여부 확인)
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key={API_KEY}&id=${videoIds.join(',')}&part=snippet,liveStreamingDetails`;
        const detailsResponse = await fetchWithRetry(detailsUrl);
        
        const liveVideo = detailsResponse.data.items.find(video => 
            video.snippet.liveBroadcastContent === "live"
        );

        if (!liveVideo) return;

        const videoId = liveVideo.id;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const videoTitle = liveVideo.snippet.title;

        // 3️⃣ 기존 알림된 영상인지 확인
        const prevData = fs.existsSync(LIVE_INFO_PATH)
            ? JSON.parse(fs.readFileSync(LIVE_INFO_PATH, 'utf-8'))
            : { lastLiveId: null };

        if (prevData.lastLiveId === videoId) return;

        // 4️⃣ 새로운 라이브 정보 저장
        fs.writeFileSync(LIVE_INFO_PATH, JSON.stringify({ lastLiveId: videoId }, null, 2));

        // 5️⃣ 디스코드 알림 전송
        await axios.post(WEBHOOK_URL, {
            content: `🔴 **라이브 스트리밍 시작!**\n${videoUrl}`
        });

    } catch (error) {
        console.error('❌ 유튜브 라이브 스트리밍 확인 중 오류 발생:', error.response?.data || error.message);
    }
}

module.exports = { checkLiveStream };
