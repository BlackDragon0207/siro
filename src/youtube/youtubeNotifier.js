const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_KEYS = process.env.YOUTUBE_API_KEYS.split(',');
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const VIDEO_INFO_PATH = path.join(__dirname, '../../videoInfo.json');
const SHORTS_INFO_PATH = path.join(__dirname, '../../shortsInfo.json');

let currentApiKeyIndex = 0;

function getApiKey() {
    return API_KEYS[currentApiKeyIndex];
}

function switchApiKey() {
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
    console.error('❌ 모든 API 키의 할당량이 초과되었습니다. 10초 후 재시도합니다.');
    await new Promise(res => setTimeout(res, 10000)); // 10초 대기 후 재시도
    return fetchWithRetry(url);
}

function readJsonFile(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (error) {
        console.error(`❌ JSON 파일 읽기 오류: ${filePath}`, error);
    }
    return defaultValue;
}

function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`❌ JSON 파일 저장 오류: ${filePath}`, error);
    }
}

async function checkLatestVideoAndShorts() {
    try {
        console.log("🔍 유튜브 최신 영상 검사 중...");

        const prevVideoData = readJsonFile(VIDEO_INFO_PATH, { lastVideoId: null });
        const prevShortsData = readJsonFile(SHORTS_INFO_PATH, { lastShortsId: null });

        const searchUrl = `https://www.googleapis.com/youtube/v3/search?key={API_KEY}&channelId=${CHANNEL_ID}&part=id,snippet&order=date&maxResults=1`;
        const searchResponse = await fetchWithRetry(searchUrl);
        const video = searchResponse.data.items[0];

        if (!video || video.id.kind !== "youtube#video") return;

        const videoId = video.id.videoId;
        const videoTitle = video.snippet.title;

        if (prevVideoData.lastVideoId === videoId || prevShortsData.lastShortsId === videoId) {
            console.log("⚠️ 이미 처리된 영상입니다. 알림을 보내지 않습니다.");
            return;
        }

        const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?key={API_KEY}&id=${videoId}&part=contentDetails,snippet,liveStreamingDetails`;
        const videoDetailsResponse = await fetchWithRetry(videoDetailsUrl);
        const videoData = videoDetailsResponse.data.items[0];

        if (!videoData) return;

        const isLive = videoData.snippet.liveBroadcastContent === "live" || videoData.liveStreamingDetails;
        if (isLive) {
            console.log("⏩ 라이브 스트리밍 영상 감지됨, 알림을 보내지 않습니다.");
            return;
        }

        const duration = videoData.contentDetails?.duration || "";
        const videoLength = getVideoDurationInSeconds(duration);

        const isShorts = videoLength <= 180 && (
            videoData.snippet.title.toLowerCase().includes("#shorts") || 
            videoData.snippet.description.toLowerCase().includes("#shorts")
        );

        console.log(`🎬 감지된 영상: ${videoTitle} (${videoId})`);
        console.log("⏳ 영상 길이:", videoLength, "초");

        if (isShorts) {
            console.log("🚨 쇼츠 영상 감지됨!");
            writeJsonFile(SHORTS_INFO_PATH, { lastShortsId: videoId });
            await sendDiscordNotification(`**しろちゃん【시로챤】 채널에 새로운 쇼츠 영상이 업로드 되었습니다!**\nhttps://www.youtube.com/shorts/${videoId}`);
            return;
        }

        console.log("📢 일반 영상 감지됨!");
        writeJsonFile(VIDEO_INFO_PATH, { lastVideoId: videoId });
        await sendDiscordNotification(`**しろちゃん【시로챤】 채널에 새로운 영상이 업로드 되었습니다!**\nhttps://www.youtube.com/watch?v=${videoId}`);

    } catch (error) {
        console.error('❌ 유튜브 영상 확인 중 오류 발생:', error.response?.data || error.message);
    }
}

function getVideoDurationInSeconds(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    return hours * 3600 + minutes * 60 + seconds;
}

async function sendDiscordNotification(message) {
    try {
        await axios.post(WEBHOOK_URL, { content: message });
    } catch (error) {
        console.error("❌ 디스코드 웹훅 전송 오류:", error.message);
    }
}

module.exports = { checkLatestVideoAndShorts };
