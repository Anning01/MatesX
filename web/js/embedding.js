// embedding.js

class EmbeddingManager {
    constructor() {
        this.memories = [];
    }

    /**
     * 初始化记忆库
     * @param {Array} memories - 记忆数组，每个元素包含 vector, text, frequency, norm, createdAt, updatedAt
     */
    initialize(memories) {
        this.memories = memories || [];
    }

    /**
     * 获取文本的嵌入向量
     * @param {string} text - 输入文本
     * @returns {Promise<Array<number>>} - 嵌入向量
     */
    async getEmbedding(text, apiKey) {
        const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

        const payload = {
            model: "text-embedding-v4",
            input: text,
            dimensions: 768,
            encoding_format: "float"
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.data && data.data.length > 0 && data.data[0].embedding) {
                return data.data[0].embedding;
            } else {
                throw new Error('Failed to extract embedding from response');
            }
        } catch (error) {
            console.error('Error fetching embedding:', error);
            throw error;
        }
    }

    /**
     * 计算两个向量的余弦相似度
     * @param {Array<number>} vec1 - 第一个向量
     * @param {Array<number>} vec2 - 第二个向量
     * @returns {number} - 余弦相似度 (0.0 - 1.0)
     */
    cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) {
            return 0.0;
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);
        if (norm1 === 0 || norm2 === 0) {
            return 0.0;
        }

        return dotProduct / (norm1 * norm2);
    }

    /**
     * 搜索相似的记忆
     * @param {Array<number>} queryEmbedding - 查询向量
     * @param {number} k - 返回结果数量，默认5
     * @param {number} threshold - 相似度阈值，默认0.7
     * @returns {Array<string>} - 按相似度降序排列的文本列表
     */
    searchSimilarMemories(queryEmbedding, k = 5, threshold = 0.7) {
        if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
            throw new Error('Invalid query embedding');
        }
        const similarities = [];

        for (let i = 0; i < this.memories.length; i++) {
            const memory = this.memories[i];
            if (memory && memory.vector && Array.isArray(memory.vector)) {
                const similarity = this.cosineSimilarity(queryEmbedding, memory.vector);
                if (similarity >= threshold) {
                    similarities.push({
                        index: i,
                        similarity: similarity,
                        memory: memory
                    });
                }
            }
        }

        // 按相似度降序排序
        similarities.sort((a, b) => b.similarity - a.similarity);

        // 提取前k个结果的文本内容
        return similarities.slice(0, k).map(item => item.memory.text);
    }
}

// 创建全局实例（可选）
const embeddingManagerInstance = new EmbeddingManager();

// 挂载到全局（仅用于浏览器环境）
if (typeof window !== 'undefined') {
    window.EmbeddingManager = EmbeddingManager;       // 类构造器（可选）
    window.embeddingManager = embeddingManagerInstance; // 单例实例（推荐使用）
}
