const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_KEYS = process.env.YOUTUBE_API_KEYS.split(',');
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBHOOK_URL = process.env.DISCORD_LIVE_WEBHOOK;
const LIVE_INFO_PATH = path.join(__dirname, '../../liveInfo.json');

let currentApiKeyIndex = 0;
let requestCount = 0;

// API 키 관리 함수
function getApiKey() {
    return API_KEYS[currentApiKeyIndex];
}

function switchApiKey() {
    requestCount++;
    if (requestCount % 50 === 0) { // 50회 요청마다 API 키 변경
        currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
        console.warn(`🚨 API 키 변경: ${currentApiKeyIndex + 1}/${API_KEYS.length}`);
    }
}

// API 요청 및 재시도 로직
async function fetchWithRetry(url) {
    for (let i = 0; i < API_KEYS.length; i++) {
        try {
            const apiKey = getApiKey();
            const response = await axios.get(url.replace('{API_KEY}', apiKey));
            switchApiKey();
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

// JSON 파일 읽기 함수
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

// 유튜브 라이브 스트리밍 확인 함수
async function checkLiveStream() {
    try {
        console.log("🔍 유튜브 라이브 스트리밍 확인 중...");

        // 최신 활동 (라이브 포함) 가져오기
        const activitiesUrl = `https://www.googleapis.com/youtube/v3/activities?key={API_KEY}&channelId=${CHANNEL_ID}&part=contentDetails&maxResults=5`;
        const activitiesResponse = await fetchWithRetry(activitiesUrl);

        if (!activitiesResponse.data.items || activitiesResponse.data.items.length === 0) {
            console.log("⚠️ 검색된 활동이 없습니다.");
            return;
        }

        for (const activity of activitiesResponse.data.items) {
            const videoId = activity.contentDetails.upload?.videoId;
            if (!videoId) continue; // 영상이 아니면 무시

            // 라이브 여부 확인
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key={API_KEY}&id=${videoId}&part=snippet,liveStreamingDetails`;
            const detailsResponse = await fetchWithRetry(detailsUrl);

            if (!detailsResponse.data.items || detailsResponse.data.items.length === 0) {
                console.log(`⚠️ 영상 정보를 찾을 수 없음 (videoId: ${videoId})`);
                continue;
            }

            const videoData = detailsResponse.data.items[0];

            // 🔴 라이브 여부 체크
            const isLive = videoData.snippet.liveBroadcastContent !== "none"
                        || videoData.liveStreamingDetails?.actualStartTime;

            console.log(`🎥 영상 확인: ${videoData.snippet.title} | liveBroadcastContent: ${videoData.snippet.liveBroadcastContent}`);

            if (!isLive) {
                console.log("📢 현재 진행 중인 라이브가 아닙니다.");
                continue;
            }

            const videoTitle = videoData.snippet.title;
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

            // 기존 감지된 라이브인지 확인
            const prevData = readJsonFile(LIVE_INFO_PATH, { lastLiveId: null });

            if (prevData.lastLiveId === videoId) {
                console.log("⚠️ 이미 알림을 보낸 라이브입니다.");
                return;
            }

            // 새로운 라이브 정보 저장
            fs.writeFileSync(LIVE_INFO_PATH, JSON.stringify({ lastLiveId: videoId }, null, 2));

            // 🔴 디스코드 알림 전송
            console.log(`🔴 라이브 감지됨: ${videoTitle} (${videoUrl})`);
            await axios.post(WEBHOOK_URL, {
                content: `🔴 **しろちゃん【시로챤】 채널에서 라이브가 시작되었습니다!**\n${videoUrl}`
            });

            return; // 라이브 감지되면 반복문 종료
        }

        console.log("📢 현재 진행 중인 라이브가 없습니다.");
    } catch (error) {
        console.error('❌ 유튜브 라이브 확인 중 오류:', error.response?.data || error.message);

        // 🚨 API 에러 시 30초 후 재시도
        setTimeout(checkLiveStream, 30 * 1000);
    }
}

module.exports = { checkLiveStream };
