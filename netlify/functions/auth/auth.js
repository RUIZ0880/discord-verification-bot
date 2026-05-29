exports.handler = async (event) => {
    console.log('🔍 Función auth.js ejecutada');
    console.log('Path:', event.path);
    console.log('Query:', event.queryStringParameters);
    
    // Verificar si es callback
    if (event.path.includes('/callback')) {
        const { code } = event.queryStringParameters;
        
        if (!code) {
            return {
                statusCode: 400,
                body: 'No se recibió código de autorización'
            };
        }
        
        // Por ahora, solo muestra que llegó
        return {
            statusCode: 200,
            body: `✅ Callback recibido con código: ${code}`
        };
    }
    
    // Redirigir a Discord
    return {
        statusCode: 302,
        headers: {
            Location: 'https://discord.com'
        }
    };
};
