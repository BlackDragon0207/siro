const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

require("dotenv").config();

const TWITTER_USERNAME = "Siro_UwU";
const DISCORD_CHANNEL_ID = "1287733386177155072";
const LAST_TWEET_FILE = path.join(__dirname, "lastTweetId.txt");

// 프로필 이미지 경로
const PROFILE_IMAGE_PATH = path.join(__dirname, "images", "profile.jpg");

// 마지막으로 전송한 트윗 ID 불러오기
let lastTweetId = fs.existsSync(LAST_TWEET_FILE) ? fs.readFileSync(LAST_TWEET_FILE, "utf8").trim() : null;

async function getLatestTweet() {
    console.log("🔍 트위터 크롤링 시작...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    
    // 트위터 봇 감지 방지
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    );

    if (fs.existsSync("cookies.json")) {
        const cookies = JSON.parse(fs.readFileSync("cookies.json"));
        await page.setCookie(...cookies);
    } else {
        console.error("❌ cookies.json 파일이 없습니다. saveCookies.js를 먼저 실행하세요.");
    }
    

    try {
        await page.goto(`https://twitter.com/${TWITTER_USERNAME}`, { waitUntil: "networkidle2" });
        await page.waitForSelector('[data-testid="tweet"]', { timeout: 30000 });

        const tweets = await page.evaluate(() => {
            const articles = document.querySelectorAll("article");
            const tweetData = [];
        
            for (const article of articles) {
                if (article.querySelector('[data-testid="socialContext"]')) continue; // 고정 트윗 제외
        
                const textElement = article.querySelector('[data-testid="tweetText"]');
                const linkElement = article.querySelector('a[href*="/status/"]');
                const timeElement = article.querySelector("time");
                if (!linkElement || !timeElement) continue;
        
                const tweetTime = new Date(timeElement.getAttribute("datetime"));
                const now = new Date();
                const timeDiff = (now - tweetTime) / (1000 * 60 * 60 * 24);
        
                if (timeDiff > 3) continue; // 3일 이상 지난 트윗 제외
        
                let tweetContent = textElement
                    ? textElement.innerHTML
                        .replace(/<img[^>]+alt="([^"]+)"[^>]*>/g, "$1")
                        .replace(/<br\s*\/?>/gi, "\n")
                        .replace(/<\/?[^>]+(>|$)/g, "")
                    : "(내용 없음)";
        
                const imageElement = article.querySelector('img[src*="twimg.com/media"]');
                const imageUrl = imageElement ? imageElement.src : null;
        
                tweetData.push({
                    text: tweetContent.trim(),
                    id: linkElement.href.split("/").pop(),
                    url: linkElement.href,
                    image: imageUrl,
                    date: tweetTime.toISOString()
                });
            }
        
            return tweetData.length > 0 ? tweetData.shift() : null; // 최신 트윗 반환
        });

        return tweets;
    } catch (error) {
        console.error("❌ 트위터 크롤링 오류:", error.message);
        return null;
    } finally {
        await browser.close();
    }
}

async function checkTweetAndNotify(client) {
    const latestTweet = await getLatestTweet();
    if (!latestTweet || latestTweet.id === lastTweetId) return console.log("⏭️ 새로운 트윗 없음.");

    lastTweetId = latestTweet.id;
    fs.writeFileSync(LAST_TWEET_FILE, lastTweetId, "utf8"); // 트윗 ID 저장

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    if (!channel) return console.error("❌ 디스코드 채널을 찾을 수 없음.");

    const profileImage = new AttachmentBuilder(PROFILE_IMAGE_PATH, { name: "profile_icon.jpg" });

    // Embed 메시지 생성
    const embed = new EmbedBuilder()
        .setColor("#ff80e2")
        .setTitle("📢 새로운 트윗이 올라왔습니다!")
        .setDescription(`${latestTweet.text}\n\n[트윗 보러가기](${latestTweet.url})`)
        .setAuthor({
            name: TWITTER_USERNAME,
            url: `https://twitter.com/${TWITTER_USERNAME}`
        })
        .setThumbnail("attachment://profile_icon.jpg")
        .setFooter({ text: `해당 알림은 실제와 약 5분 정도 딜레이가 있습니다` }) 
        .setTimestamp(new Date());

    if (latestTweet.image) {
        const tweetImage = new AttachmentBuilder(latestTweet.image, { name: "tweet_image.jpg" });
        embed.setImage("attachment://tweet_image.jpg");
        await channel.send({ embeds: [embed], files: [profileImage, tweetImage] });
    } else {
        await channel.send({ embeds: [embed], files: [profileImage] });
    }
}

module.exports = checkTweetAndNotify;