// src/commands/reload.js
require('dotenv/config');
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { readdirSync } = require('fs');
const { REST, Routes } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('봇 명령어를 등록 및 리로')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator), // Only admin can use this command

    async execute(interaction) {
        const client = interaction.client;
        const rest = new REST({ version: '10' }).setToken(process.env.token);

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        // Clear existing commands
        client.commands.clear();
        await interaction.reply({ content: '기존 명령어를 제거중...', ephemeral: true });

        // Load and register new commands
        try {
            // Update the path to the commands folder
            const commandFiles = readdirSync('./src/commands').filter(file => file.endsWith('.js'));
            console.debug(`새 명령어 파일을 로드 중: ${commandFiles.length}개의 파일 발견`);

            const commands = [];
            for (const file of commandFiles) {
                try {
                    const command = require(`./${file}`); // Ensure correct path to require
                    if (command.data && command.data.name) {
                        client.commands.set(command.data.name, command);
                        commands.push(command.data.toJSON());
                        console.debug(`명령어 데이터 준비 완료: ${command.data.name}`);
                    } else {
                        console.error(`명령어 파일 구조가 잘못되었습니다: ${file}`);
                    }
                } catch (error) {
                    console.error(`명령어 데이터 준비 중 오류 발생 (${file}):`, error);
                }
            }

            await rest.put(Routes.applicationGuildCommands(process.env.clientId, process.env.guildId), {
                body: commands,
            });

            await interaction.followUp({ content: '모든 명령어가 새로 등록되었습니다!', ephemeral: true });
        } catch (error) {
            console.error('명령어 로드 및 등록 중 오류 발생:', error);
            await interaction.followUp({ content: '명령어 로드 및 등록 중 오류가 발생했습니다.', ephemeral: true });
        }
    },
};
