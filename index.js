const { AttachmentBuilder, ActivityType, Client, GatewayIntentBits, Events, Partials, Collection, EmbedBuilder, ClientUser, messageLink } = require('discord.js');
//const { token, logChannelId } = require('./config.json');
const path = require('path');
const { readdirSync } = require('fs');
const fs = require('fs');
require('dotenv/config');
const { startYoutubeNotifier } = require('./src/youtube');

startYoutubeNotifier();

// 클라이언트 초기화
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions, // 이모티콘 반응 감지
        GatewayIntentBits.GuildVoiceStates, // 보이스 감지
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
    ],
});

client.commands = new Collection();

// 에러 로그 함수 추가
async function sendErrorLog(errorMessage) {
    console.error(`[ERROR LOG] ${errorMessage}`);
    // 추가적인 로깅 로직이 필요하면 여기에 구현
    // 예: 특정 채널에 에러 메시지 전송
    // const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
    // if (logChannel) {
    //     await logChannel.send(`⚠️ 오류 발생: ${errorMessage}`);
    // }
}

// 명령어 파일 불러오기 - 절대 경로로 src/commands 지정
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.debug(`명령어 파일을 로드 중: ${commandFiles.length}개의 파일 발견`);

for (const file of commandFiles) {
    try {
        // 명령어 파일 로드 (src/commands 폴더에서)
        const command = require(path.join(commandsPath, file));
        if (command.data && command.data.name) {
            client.commands.set(command.data.name, command);
            console.debug(`명령어 로드 완료: ${command.data.name}`);
        } else {
            throw new Error(`명령어 파일 구조가 잘못되었습니다: ${file}`);
        }
    } catch (error) {
        console.error(`명령어 파일 로드 실패 (${file}):`, error);
        sendErrorLog(`명령어 파일 로드 실패 (${file}): ${error.message}`);
    }
}


// security 폴더에서 모든 보안 기능 자동 로드
const securityPath = path.join(__dirname, "src/security");
fs.readdirSync(securityPath).forEach(file => {
    const securityModule = require(`./src/security/${file}`);
    client.on(securityModule.name, (...args) => securityModule.execute(...args));
});


// 봇 준비 이벤트
client.once('ready', async () => {
    const messages = [
        '나의 작은 아기고양이(私の小さな子猫たち)',
        '개발자 : 흑룡'
    ];
    let current = 0;
    
    setInterval(() => {
        client.user.setPresence({
            activities: [{ name: `${messages[current]}`, type: ActivityType.Watching }],
            status: 'idle',
        });
        
        current = (current + 1) % messages.length;
    }, 7500);
    
    console.log(`${client.user.tag}로 로그인 되었습니다!`);
    console.debug(`현재 서버에 연결된 길드 수: ${client.guilds.cache.size}`);
});


// 명령어 인터랙션 이벤트
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    console.debug(`명령어 실행 요청: ${interaction.commandName}`);

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.debug(`명령어를 찾을 수 없음: ${interaction.commandName}`);
        return;
    }
    try {
        await command.execute(interaction);
        console.debug(`명령어 실행 성공: ${interaction.commandName}`);
    } catch (error) {
        console.error(`명령어 실행 중 오류 발생: ${interaction.commandName}`, error);
        sendErrorLog(`명령어 실행 중 오류 발생: ${error.message}\n\n명령어: ${interaction.commandName}`);
        await interaction.reply({ content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
    }
});


// 클라이언트 로그인
client.login(process.env.token).then(() => {
    console.log('봇이 성공적으로 로그인 되었습니다.');
}).catch(error => {
    console.error('로그인 중 오류 발생:', error);
});


