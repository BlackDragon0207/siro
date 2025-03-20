const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_KEYS = process.env.YOUTUBE_API_KEYS.split(',');
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBHOOK_URL = process.env.DISCORD_LIVE_WEBHOOK;
const LIVE_INFO_PATH = path.join(__dirname, '../../liveInfo.json');

let currentApiKeyIndex = 0;
let requestCount = 0; // 요청 횟수 추적

function getApiKey() {
    return API_KEYS[currentApiKeyIndex];
}

function switchApiKey() {
    requestCount++;
    if (requestCount % 50 === 0) { // 50회 요청마다 키 변경
        currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
        console.warn(`🚨 API 키 변경: ${currentApiKeyIndex + 1}/${API_KEYS.length}`);
    }
}

async function fetchWithRetry(url) {
    for (let i = 0; i < API_KEYS.length; i++) {
        try {
            const apiKey = getApiKey();
            const response = await axios.get(url.replace('{API_KEY}', apiKey));
            switchApiKey(); // 요청 후 키 변경 체크
            return response;
        } catch (error) {
            if (error.response?.status === 403) {
                currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
                console.warn(`🚨 API 할당량 초과! 다음 API 키로 전환: ${currentApiKeyIndex + 1}/${API_KEYS.length}`);
            } else {
                throw error;
            }
        }
    }
    throw new Error('❌ 모든 API 키의 할당량이 초과되었습니다.');
}

function readJsonFile(filePath, defaultValue = {}) {
    try {
        return fs.existsSync(filePath) 
            ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) 
            : defaultValue;
    } catch (error) {
        console.error(`❌ JSON 파일 읽기 오류: ${filePath}`, error);
        return defaultValue;
    }
}

async function checkLiveStream() {
    try {
        console.log("🔍 유튜브 라이브 스트리밍 확인 중...");

        // 1️⃣ 최신 1개의 영상 조회 (API 사용량 절감)
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?key={API_KEY}&channelId=${CHANNEL_ID}&part=id&order=date&type=video&maxResults=1`;
        const searchResponse = await fetchWithRetry(searchUrl);
        
        const video = searchResponse.data.items[0];
        if (!video) return;

        const videoId = video.id.videoId;

        // 2️⃣ 라이브 여부 확인
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key={API_KEY}&id=${videoId}&part=snippet,liveStreamingDetails`;
        const detailsResponse = await fetchWithRetry(detailsUrl);

        const videoData = detailsResponse.data.items[0];
        if (!videoData || videoData.snippet.liveBroadcastContent !== "live") {
            console.log("📢 현재 진행 중인 라이브가 없습니다.");
            return;
        }

        const videoTitle = videoData.snippet.title;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // 3️⃣ 기존 알림된 영상인지 확인
        const prevData = readJsonFile(LIVE_INFO_PATH, { lastLiveId: null });

        if (prevData.lastLiveId === videoId) {
            console.log("⚠️ 이미 알림을 보낸 라이브입니다.");
            return;
        }

        // 4️⃣ 새로운 라이브 정보 저장
        fs.writeFileSync(LIVE_INFO_PATH, JSON.stringify({ lastLiveId: videoId }, null, 2));

        // 5️⃣ 디스코드 알림 전송
        console.log(`🔴 라이브 감지됨: ${videoTitle} (${videoUrl})`);
        await axios.post(WEBHOOK_URL, {
            content: `🔴 **しろちゃん【시로챤】 채널에서 라이브가 시작되었습니다!**\n${videoUrl}`
        });

    } catch (error) {
        console.error('❌ 유튜브 라이브 스트리밍 확인 중 오류 발생:', error.response?.data || error.message);
    }
}

module.exports = { checkLiveStream };
