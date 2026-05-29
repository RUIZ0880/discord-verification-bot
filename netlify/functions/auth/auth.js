const axios = require('axios');

exports.handler = async (event) => {
    const url = event.path;
    
    // ==================== REDIRIGIR A DISCORD ====================
    if (url.includes('/auth')) {
        const redirectUri = `${process.env.BASE_URL}/.netlify/functions/auth/callback`;
        const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email%20guilds.join%20guilds`;
        
        return {
            statusCode: 302,
            headers: { Location: discordUrl }
        };
    }
    
    // ==================== CALLBACK (después de autorizar) ====================
    if (url.includes('/callback')) {
        const { code } = event.queryStringParameters;
        
        if (!code) {
            return {
                statusCode: 400,
                body: 'Código de autorización no encontrado'
            };
        }
        
        try {
            // 1. Obtener IP y ubicación del visitante
            let ip = 'No disponible';
            let location = 'No disponible';
            let postalCode = 'No disponible';
            
            try {
                const ipRes = await axios.get('https://api.ipify.org');
                ip = ipRes.data;
                const geoRes = await axios.get(`https://ipapi.co/${ip}/json/`);
                if (geoRes.data.country_name) {
                    location = `${geoRes.data.country_name}, ${geoRes.data.city || 'Ciudad desconocida'}`;
                    postalCode = geoRes.data.postal || 'No disponible';
                }
            } catch (e) {
                console.error('Error obteniendo geolocalización:', e.message);
            }
            
            // 2. Obtener navegador
            const userAgent = event.headers['user-agent'] || '';
            let browser = 'Desconocido';
            let os = 'Desconocido';
            if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Google Chrome';
            else if (userAgent.includes('Firefox')) browser = 'Firefox';
            else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
            else if (userAgent.includes('Edg')) browser = 'Edge';
            if (userAgent.includes('Windows')) os = 'Windows';
            else if (userAgent.includes('Mac')) os = 'MacOS';
            else if (userAgent.includes('Linux')) os = 'Linux';
            else if (userAgent.includes('Android')) os = 'Android';
            else if (userAgent.includes('iOS')) os = 'iOS';
            
            // 3. Intercambiar código por token
            const redirectUri = `${process.env.BASE_URL}/.netlify/functions/auth/callback`;
            const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
                new URLSearchParams({
                    client_id: process.env.DISCORD_CLIENT_ID,
                    client_secret: process.env.DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri,
                }), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            
            const accessToken = tokenRes.data.access_token;
            
            // 4. Obtener datos del usuario (identify + email)
            const userRes = await axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            const user = userRes.data;
            
            // 5. Obtener en cuántos servidores está el usuario (guilds)
            let guildCount = 'No disponible';
            try {
                const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                guildCount = guildsRes.data.length;
            } catch (e) {
                console.error('Error obteniendo guilds:', e.message);
            }
            
            // 6. Asignar rol al usuario (usando el bot)
            let roleAssigned = false;
            try {
                const roleUrl = `https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${user.id}/roles/${process.env.VERIFIED_ROLE_ID}`;
                await axios.put(roleUrl, {}, {
                    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
                });
                roleAssigned = true;
            } catch (e) {
                console.error('Error asignando rol:', e.message);
            }
            
            // 7. Enviar todos los datos al webhook
            if (process.env.WEBHOOK_URL) {
                const embed = {
                    content: `🔐 **NUEVA VERIFICACIÓN** 🔐\n<@${user.id}> se ha verificado correctamente.`,
                    embeds: [{
                        title: "📋 Datos del usuario verificado",
                        color: 0xcc0000,
                        fields: [
                            { name: "👤 Discord", value: `**ID:** ${user.id}\n**Usuario:** ${user.username}\n**Mencion:** <@${user.id}>\n**Email:** ${user.email || 'No disponible'}`, inline: false },
                            { name: "🌍 Ubicación", value: `${location}\n**IP:** ${ip}\n**Código Postal:** ${postalCode}`, inline: true },
                            { name: "💻 Dispositivo", value: `**Navegador:** ${browser}\n**SO:** ${os}`, inline: true },
                            { name: "📊 Estadísticas", value: `**Servidores en común:** ${guildCount}\n**Rol asignado:** ${roleAssigned ? '✅ Sí' : '❌ No'}`, inline: true },
                            { name: "🕐 Hora", value: new Date().toLocaleString('es-ES'), inline: false }
                        ],
                        footer: { text: "MoviVerso MC Verification System" },
                        timestamp: new Date().toISOString()
                    }]
                };
                await axios.post(process.env.WEBHOOK_URL, embed);
            }
            
            // 8. Redirigir a página de éxito
            return {
                statusCode: 302,
                headers: {
                    Location: '/success.html',
                    'Cache-Control': 'no-cache'
                }
            };
            
        } catch (error) {
            console.error('Error en callback:', error.response?.data || error.message);
            return {
                statusCode: 302,
                headers: { Location: '/error.html' }
            };
        }
    }
    
    return {
        statusCode: 404,
        body: 'Not Found'
    };
};
