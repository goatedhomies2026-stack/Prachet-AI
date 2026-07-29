exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { messages, model, isSearch, userQuery } = JSON.parse(event.body);

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    if (!GROQ_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Groq API Key (GROQ_API_KEY) is missing in Netlify Environment Variables.' })
      };
    }

    let payloadMessages = [...messages];

    // Optional Tavily Web Search
    if (isSearch) {
      if (!TAVILY_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Tavily API Key (TAVILY_API_KEY) is missing in Netlify Environment Variables.' })
        };
      }

      const searchRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: TAVILY_API_KEY, query: userQuery, max_results: 3 })
      });

      if (!searchRes.ok) {
        throw new Error('Web search failed via Tavily.');
      }

      const searchData = await searchRes.json();
      const context = searchData.results.map(r => `[Source: ${r.title}]\n${r.content}`).join('\n\n');

      const lastIdx = payloadMessages.length - 1;
      payloadMessages[lastIdx] = {
        role: 'user',
        content: `Real-Time Search Context:\n${context}\n\nUser Question: ${userQuery}`
      };
    }

    // Secure Call to Groq API
    const systemPrompt = process.env.SYSTEM_PROMPT || 'You are Prachet AI, a helpful, intelligent assistant.';
    
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'system', content: systemPrompt }, ...payloadMessages],
        model: model || 'llama-3.3-70b-versatile'
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.json();
      throw new Error(err.error?.message || 'Groq API request failed.');
    }

    const data = await groqRes.json();
    const reply = data.choices[0].message.content;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
