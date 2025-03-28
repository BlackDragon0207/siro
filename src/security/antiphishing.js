const { EmbedBuilder } = require("discord.js");

// 피싱 링크를 체크할 때 제외할 도메인 리스트 (정당한 도메인으로 판단되는 링크들)
const excludedDomains = [
    "discord.com",
    "google.com",
    "youtube.com"
];

// 의심스러운 키워드 리스트
const suspiciousKeywords = [
    "free", "clickhere", "login", "verify", "phishing", "scam", "gift", "password"
];

// URL이 의심스러운지 검사하는 함수
function isSuspicious(url) {
    const domain = url.replace(/^https?:\/\/(?:www\.)?/, "").split("/")[0];
    
    // 제외된 도메인이라면 피싱 링크로 처리하지 않음
    if (excludedDomains.includes(domain)) {
        console.log(`⚠️ 제외된 도메인: ${domain}`);
        return false; // 제외된 도메인은 피싱 링크로 처리하지 않음
    }

    // URL에 의심스러운 키워드가 포함되어 있는지 체크
    for (const keyword of suspiciousKeywords) {
        if (url.toLowerCase().includes(keyword)) {
            console.log(`⚠️ 의심스러운 키워드 감지: ${keyword} in ${url}`);
            return true; // 의심스러운 키워드가 포함된 링크는 피싱 링크로 처리
        }
    }

    return false; // 의심스러운 링크가 아니면 정상 링크
}

module.exports = {
    name: "messageCreate",
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        // 특정 서버에서만 작동
        if (![process.env.SERVER_1_ID].includes(message.guild.id)) return;

        // 메시지 내용에서 URL과 Markdown 링크를 모두 추출하는 정규식
        const urlMatch = message.content.match(/(?:https?:\/\/|www\.)?(\S+\.\S+)(?:\/\S*)?/gi);
        if (!urlMatch) return;

        for (const url of urlMatch) {
            const normalizedUrl = url.startsWith("http") ? url : `http://${url}`; // https:// 붙여서 표준화

            console.log(`🔍 검사할 URL: ${normalizedUrl}`);

            const isPhishing = isSuspicious(normalizedUrl);
            if (isPhishing) {
                await message.delete();
                await message.channel.send(`${message.author}, 🚨 **피싱 링크가 감지되어 삭제되었습니다.** 보안에 유의하세요!`);

                console.log(`[보안] ${message.author.tag}의 피싱 링크 삭제 (${normalizedUrl})`);

                // 서버별 로그 채널 ID 가져오기
                const logChannelId = process.env.LOG_CHANNEL_1;
                if (logChannelId) {
                    const logChannel = message.guild.channels.cache.get(logChannelId);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("🚨 피싱 링크 감지")
                            .setDescription(`**사용자:** ${message.author.tag} (${message.author.id})\n**채널:** ${message.channel}\n**링크:** ${normalizedUrl}`)
                            .setTimestamp();
                        logChannel.send({ embeds: [embed] });
                    }
                }
            } else {
                console.log(`✅ 안전한 링크: ${normalizedUrl}`);
            }
        }
    }
};
