// database.js

/**
 * MemoryDataDB - 基于 IndexedDB 的角色记忆数据管理器
 */
class MemoryDataDB {
    /**
     * 构造函数
     */
    constructor() {
        /** @type {string} */
        this.DB_NAME = 'DataDB';
        /** @type {number} */
        this.DB_VERSION = 1;
        /** @type {string} */
        this.STORE_NAME = 'memory';

        /** @type {IDBDatabase | null} */
        this.db = null;
        /** @type {boolean} */
        this.isInitialized = false;
    }

    /**
     * 初始化数据库
     * @returns {Promise<void>}
     */
    async init() {
        if (this.isInitialized) {
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB 打开失败:', request.error);
                reject(new Error(`数据库打开失败: ${request.error.message}`));
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isInitialized = true;
                console.log('数据库初始化成功');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('avatarID', 'avatarID', { unique: true });
                    console.log('对象存储和索引创建成功');
                }
            };
        });
    }

    // ———————————————————————————————————————————————————————
    // 数据操作：CRUD
    // ———————————————————————————————————————————————————————

    /**
     * 保存角色数据（存在则更新，不存在则新增）
     * @param {Object} memoryData - 角色数据对象
     * @param {string} memoryData.avatarID - 角色唯一标识
     * @param {number} memoryData.memoryVersion - 记忆版本
     * @param {number} memoryData.createdAt - 创建时间戳
     * @param {number} memoryData.updatedAt - 更新时间戳
     * @param {number} memoryData.numEntries - 条目数量
     * @param {number} memoryData.dim - 向量维度
     * @param {Array<Object>} memoryData.memories - 记忆条目数组
     * @returns {Promise<void>}
     */
    async saveMemoryData(memoryData) {
        if (!this.db) {
            throw new Error('数据库未初始化，请先调用 init()');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const index = store.index('avatarID');

            const getRequest = index.openCursor(IDBKeyRange.only(memoryData.avatarID));

            getRequest.onsuccess = () => {
                const cursor = getRequest.result;
                let request;

                if (cursor) {
                    // 更新现有记录
                    const existingData = cursor.value;
                    Object.assign(existingData, {
                        memoryVersion: memoryData.memoryVersion,
                        createdAt: memoryData.createdAt,
                        updatedAt: memoryData.updatedAt,
                        numEntries: memoryData.numEntries,
                        dim: memoryData.dim,
                        memories: memoryData.memories
                    });
                    request = cursor.update(existingData);
                } else {
                    // 新增记录
                    request = store.add(memoryData);
                }

                request.onsuccess = () => resolve();
                request.onerror = () => {
                    console.error('保存数据失败:', request.error);
                    reject(new Error(`保存失败: ${request.error.message}`));
                };
            };

            getRequest.onerror = () => {
                console.error('查询索引失败:', getRequest.error);
                reject(new Error(`查询失败: ${getRequest.error.message}`));
            };
        });
    }

    /**
     * 根据 avatarID 获取角色数据
     * @param {string} avatarID - 角色唯一标识
     * @returns {Promise<Array<Object>>} - 匹配的数据数组（通常为0或1个元素）
     */
    async getMemoryDataByAvatarID(avatarID) {
        console.log("getMemoryDataByAvatarID", avatarID);

        if (!this.db) {
            throw new Error('数据库未初始化，请先调用 init()');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const index = store.index('avatarID');

            const request = index.getAll(IDBKeyRange.only(avatarID));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                console.error('获取数据失败:', request.error);
                reject(new Error(`获取失败: ${request.error.message}`));
            };
        });
    }

    /**
     * 根据主键 ID 删除角色数据
     * @param {number} id - 数据主键
     * @returns {Promise<void>}
     */
    async deleteMemoryData(id) {
        if (!this.db) {
            throw new Error('数据库未初始化，请先调用 init()');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error('删除数据失败:', request.error);
                reject(new Error(`删除失败: ${request.error.message}`));
            };
        });
    }

    // ———————————————————————————————————————————————————————
    // 二进制解析工具
    // ———————————————————————————————————————————————————————

    /**
     * 将 float16 转换为 float32
     * @param {number} halfFloat - 16位半精度浮点数（Uint16）
     * @returns {number} - 32位浮点数
     */
    _float16ToFloat32(halfFloat) {
        const sign = (halfFloat & 0x8000) ? -1 : 1;
        const exponent = (halfFloat & 0x7C00) >> 10;
        const fraction = halfFloat & 0x03FF;

        if (exponent === 0) {
            return sign * Math.pow(2, -14) * (fraction / 1024);
        }
        if (exponent === 0x1F) {
            return fraction ? NaN : sign * Infinity;
        }
        return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
    }

    /**
     * 解析二进制缓冲区为角色数据对象
     * @param {ArrayBuffer} buffer - 二进制数据缓冲区
     * @returns {Object} - 解析后的角色数据对象
     * @throws {Error} - 解析失败时抛出错误
     */
    parseBinaryData(buffer) {
        try {
            const view = new DataView(buffer);
            let offset = 0;
            const decoder = new TextDecoder('utf-8');

            // 读取 avatarID
            const avatarIDLength = view.getUint32(offset, true);
            offset += 4;
            const avatarIDArray = new Uint8Array(buffer, offset, avatarIDLength);
            const avatarID = decoder.decode(avatarIDArray);
            offset += avatarIDLength;

            // 读取元数据
            const memoryVersion = view.getUint32(offset, true); offset += 4;
            const createdAt = view.getUint32(offset, true); offset += 4;
            const updatedAt = view.getUint32(offset, true); offset += 4;
            const numEntries = view.getUint32(offset, true); offset += 4;
            const dim = view.getUint32(offset, true); offset += 4;

            // 初始化数组
            const vectors = [];
            const norms = [];
            const frequencies = [];
            const entryCreatedAts = [];
            const entryUpdatedAts = [];

            // 读取向量、范数、频率、时间戳
            for (let i = 0; i < numEntries; i++) {
                // 向量（float16 数组）
                const vector = [];
                for (let j = 0; j < dim; j++) {
                    const half = view.getUint16(offset, true);
                    vector.push(this._float16ToFloat32(half));
                    offset += 2;
                }
                vectors.push(vector);

                // 范数（float16）
                const normHalf = view.getUint16(offset, true);
                norms.push(this._float16ToFloat32(normHalf));
                offset += 2;

                // 频率和时间戳
                frequencies.push(view.getUint32(offset, true)); offset += 4;
                entryCreatedAts.push(view.getUint32(offset, true)); offset += 4;
                entryUpdatedAts.push(view.getUint32(offset, true)); offset += 4;
            }

            // 读取文本
            const texts = [];
            for (let i = 0; i < numEntries; i++) {
                const textLength = view.getUint32(offset, true);
                offset += 4;
                const textArray = new Uint8Array(buffer, offset, textLength);
                texts.push(decoder.decode(textArray));
                offset += textLength;
            }

            // 组装 memories
            const memories = texts.map((text, i) => ({
                vector: vectors[i],
                text,
                frequency: frequencies[i],
                norm: norms[i],
                createdAt: entryCreatedAts[i],
                updatedAt: entryUpdatedAts[i]
            }));

            return {
                avatarID,
                memoryVersion,
                createdAt,
                updatedAt,
                numEntries,
                dim,
                memories
            };

        } catch (error) {
            console.error('解析二进制数据失败:', error);
            throw new Error('文件格式不正确或已损坏');
        }
    }
}

// ———————————————————————————————————————————————————————
// 单例导出
// ———————————————————————————————————————————————————————

/** @type {MemoryDataDB} */
const memoryDataDBInstance = new MemoryDataDB();

// 挂载到全局（仅用于浏览器环境）
if (typeof window !== 'undefined') {
    window.MemoryDataDB = MemoryDataDB;       // 类构造器（可选）
    window.memoryDataDB = memoryDataDBInstance; // 单例实例（推荐使用）
}