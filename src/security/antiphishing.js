const { EmbedBuilder } = require("discord.js");
const axios = require("axios");

const SAFE_BROWSING_API_KEY = process.env.SAFE_BROWSING_API_KEY; // Google Safe Browsing API 키
const SERVER_1_ID = process.env.SERVER_1_ID; // 서버 1 ID
const LOG_CHANNELS = {
    [SERVER_1_ID]: process.env.LOG_CHANNEL_1
};

async function checkPhishing(url) {
    try {
        const response = await axios.post(
            "https://safebrowsing.googleapis.com/v4/threatMatches:find",
            {
                client: {
                    clientId: "discord-bot",
                    clientVersion: "1.0",
                },
                threatInfo: {
                    threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
                    platformTypes: ["ANY_PLATFORM"],
                    threatEntryTypes: ["URL"],
                    threatEntries: [{ url }],
                },
            },
            { params: { key: SAFE_BROWSING_API_KEY } }
        );

        return response.data.matches ? true : false;
    } catch (error) {
        console.error("[보안] 피싱 링크 검사 실패:", error.message);
        return false; // API 오류 시 링크를 허용하지 않음
    }
}

module.exports = {
    name: "messageCreate",
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        // 특정 2개의 서버에서만 작동
        if (![SERVER_1_ID].includes(message.guild.id)) return;

        const urlMatch = message.content.match(/https?:\/\/\S+/gi);
        if (!urlMatch) return;

        for (const url of urlMatch) {
            const isPhishing = await checkPhishing(url);
            if (isPhishing) {
                await message.delete();
                await message.channel.send(`${message.author}, 🚨 **피싱 링크가 감지되어 삭제되었습니다.** 보안에 유의하세요!`);

                console.log(`[보안] ${message.author.tag}의 피싱 링크 삭제 (${url})`);

                // 서버별 로그 채널 ID 가져오기
                const logChannelId = LOG_CHANNELS[message.guild.id];
                if (logChannelId) {
                    const logChannel = message.guild.channels.cache.get(logChannelId);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("🚨 피싱 링크 감지")
                            .setDescription(`**사용자:** ${message.author.tag} (${message.author.id})\n**채널:** ${message.channel}\n**링크:** ${url}`)
                            .setTimestamp();
                        logChannel.send({ embeds: [embed] });
                    }
                }
            }
        }
    }
};
