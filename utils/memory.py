import os
import json
import numpy as np
import struct
from datetime import datetime
from openai import OpenAI
import requests
from utils.dashscope import DASHSCOPE_API_KEY,DASHSCOPE_LLM_URL,HOST_URL

# 使用相同的URL进行上传和下载
memory_data_url = HOST_URL + "/api/assets/{avatar_id}/memory.bin"

class MemoryManager:
    def __init__(self, avatar_id, memory_version):
        self.avatar_id = avatar_id
        self.memory_version = memory_version
        self.created_at = int(datetime.now().timestamp())
        self.updated_at = None
        self.num_entries = 0
        self.dim = 768

        self.memories = []  # 存储格式: [{"vector": [], "norm": float, "text": str, "frequency": int, "created_at": timestamp, "updated_at": timestamp}]
        self.client = OpenAI(
            api_key=DASHSCOPE_API_KEY,
            base_url=DASHSCOPE_LLM_URL
        )

    def load_memories(self):
        """从二进制文件加载记忆数据"""
        if self.memory_version == 0:
            print("memory_version = 0，创建新的空记忆库")
            self.memories = []
            return

        # memory_version > 0，从URL加载记忆
        memory_url = memory_data_url.format(avatar_id=self.avatar_id)

        try:
        # if 1:
            # 从URL下载文件
            response = requests.get(memory_url)
            response.raise_for_status()  # 检查请求是否成功
            memory_data = response.content

            # 解析二进制数据
            self._parse_binary_data(memory_data)
            print(f"成功从URL加载 {len(self.memories)} 条记忆 (版本: {self.memory_version})")

        except requests.exceptions.RequestException as e:
            print(f"下载记忆文件失败: {e}")
            self.memories = []
        except Exception as e:
            print(f"加载记忆失败: {e}")
            self.memories = []

    def _parse_binary_data(self, binary_data):
        """解析二进制格式的记忆数据"""
        memories = []
        position = 0

        try:
            # 读取头部信息
            avatar_id_len = struct.unpack('I', binary_data[position:position + 4])[0]
            position += 4
            self.avatar_id = binary_data[position:position + avatar_id_len].decode('utf-8')
            position += avatar_id_len

            self.memory_version = struct.unpack('I', binary_data[position:position + 4])[0]
            position += 4

            self.created_at = struct.unpack('I', binary_data[position:position + 4])[0]
            position += 4

            self.updated_at = struct.unpack('I', binary_data[position:position + 4])[0]
            position += 4

            self.num_entries = struct.unpack('I', binary_data[position:position + 4])[0]
            position += 4

            self.dim = struct.unpack('I', binary_data[position:position + 4])[0]
            position += 4

            # 读取所有向量数据、模和频率数据
            for _ in range(self.num_entries):
                # 读取向量数据
                vector_bytes = binary_data[position:position + self.dim * 2]  # float16占2字节
                vector = np.frombuffer(vector_bytes, dtype=np.float16).tolist()
                position += self.dim * 2

                # 读取向量的模
                norm = struct.unpack('e', binary_data[position:position + 2])[0]
                position += 2

                # 读取频率数据
                frequency = struct.unpack('I', binary_data[position:position + 4])[0]
                position += 4

                created_at = struct.unpack('I', binary_data[position:position + 4])[0]
                position += 4
                updated_at = struct.unpack('I', binary_data[position:position + 4])[0]
                position += 4

                memories.append({
                    "vector": vector,
                    "norm": norm,
                    "frequency": frequency,
                    "created_at": created_at,
                    "updated_at": updated_at
                })

            # 读取所有文本数据
            for i in range(self.num_entries):
                text_len = struct.unpack('I', binary_data[position:position + 4])[0]
                position += 4

                text = binary_data[position:position + text_len].decode('utf-8')
                position += text_len

                memories[i]["text"] = text

        except Exception as e:
            print(f"解析二进制数据失败: {e}")
            self.memories = []
            return

        self.memories = memories

    def _create_binary_data(self):
        """创建二进制格式的记忆数据"""
        # 准备二进制数据
        binary_parts = []

        # 头部信息
        avatar_id_bytes = self.avatar_id.encode('utf-8')
        binary_parts.append(struct.pack('I', len(avatar_id_bytes)))
        binary_parts.append(avatar_id_bytes)

        # 使用更新后的版本号
        binary_parts.append(struct.pack('I', self.memory_version))


        binary_parts.append(struct.pack('I', self.created_at))
        current_time = int(datetime.now().timestamp())
        binary_parts.append(struct.pack('I', current_time))

        binary_parts.append(struct.pack('I', len(self.memories)))

        if self.memories:
            dim = len(self.memories[0]["vector"])
        else:
            dim = 768  # 默认维度
        binary_parts.append(struct.pack('I', dim))

        # 写入所有向量数据、模和频率数据
        for memory in self.memories:
            # 向量数据
            vector_bytes = np.array(memory["vector"], dtype=np.float16).tobytes()
            binary_parts.append(vector_bytes)

            # 向量的模
            binary_parts.append(struct.pack('e', memory.get("norm", 0.0)))

            # 频率数据
            binary_parts.append(struct.pack('I', memory.get("frequency", 1)))

            # 添加时间戳数据
            binary_parts.append(struct.pack('I', memory.get("created_at", 0)))
            binary_parts.append(struct.pack('I', memory.get("updated_at", 0)))

        # 写入所有文本数据
        for memory in self.memories:
            text_bytes = memory["text"].encode('utf-8')
            binary_parts.append(struct.pack('I', len(text_bytes)))
            binary_parts.append(text_bytes)

        return b''.join(binary_parts)

    def save_memories(self):
        """保存记忆数据到二进制文件并上传到OSS"""
        # 计算新版本号
        self.memory_version = self.memory_version + 1
        print(self.memory_version)

        # try:
        if 1:
            # 创建二进制数据
            memory_data = self._create_binary_data()
            # print(memory_data)
            # 上传到OSS
            upload_url = memory_data_url.format(avatar_id=self.avatar_id)
            print(upload_url)
            # 使用PUT方法上传文件到OSS
            response = requests.put(upload_url, data=memory_data)

            if response.status_code == 200:
                print(f"成功上传 {len(self.memories)} 条记忆到OSS (版本: {self.memory_version})")
                return True
            else:
                print(f"上传失败，状态码: {response.status_code}, 响应: {response.text}")
                return False

        # except Exception as e:
        #     print(f"保存记忆数据失败: {e}")
        #     return False

    def get_embeddings(self, texts):
        """获取文本的嵌入向量"""
        try:
            completion = self.client.embeddings.create(
                model="text-embedding-v4",
                input=texts,
                dimensions=768,
            )

            embeddings = [np.array(item.embedding, dtype=np.float16) for item in completion.data]
            return embeddings

        except Exception as e:
            print(f"获取嵌入向量失败: {e}")
            return None

    def cosine_similarity(self, vec1, vec2):
        """计算余弦相似度"""
        vec1_norm = np.linalg.norm(vec1)
        vec2_norm = np.linalg.norm(vec2)

        if vec1_norm == 0 or vec2_norm == 0:
            return 0.0

        return np.dot(vec1, vec2) / (vec1_norm * vec2_norm)

    def search_similar_memories(self, query_embedding, k=5, threshold=0.7):
        """搜索相似的记忆"""
        similarities = []

        for i, memory in enumerate(self.memories):
            if 'vector' in memory:
                similarity = self.cosine_similarity(query_embedding, np.array(memory['vector'], dtype=np.float32))
                if similarity >= threshold:
                    similarities.append((i, similarity, memory))

        # 按相似度排序并取前k个
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:k]

    def extract_memory_fragments(self, chat_history):
        """从聊天历史中提取记忆片段"""
        prompt = f"""
        你是一个记忆提取专家。请从以下对话历史中提取重要的记忆片段。
        每个记忆片段应该是一个简洁的事实或信息点。
        请用JSON格式返回，包含一个"fragments"数组，每个元素是一个记忆片段文本。

        对话历史:
        {chat_history}

        只返回JSON格式，不要有其他内容。
        """

        try:
            completion = self.client.chat.completions.create(
                model="qwen-plus",
                messages=[
                    {"role": "system", "content": "你是一个专业的记忆提取助手，能够从对话中准确提取重要信息。"},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )

            response = json.loads(completion.choices[0].message.content)
            return response.get("fragments", [])

        except Exception as e:
            print(f"提取记忆片段失败: {e}")
            return []

    def decide_memory_integration(self, new_fragment, similar_memories):
        """决定如何整合记忆"""
        if not similar_memories:
            return "create_new", "没有找到相似记忆"

        # 准备相似记忆的描述
        similar_memories_desc = []
        for i, (idx, similarity, memory) in enumerate(similar_memories):
            similar_memories_desc.append(f"{i + 1}. {memory['text']} (相似度: {similarity:.3f})")

        prompt = f"""
        你是一个记忆管理专家。请决定如何处理新的记忆片段。

        新的记忆片段: "{new_fragment}"

        相似的现有记忆:
        {chr(10).join(similar_memories_desc)}

        请选择以下操作之一:
        1. 如果新片段与某个现有记忆高度相关，选择"merge_with:X"（X是记忆编号）
        2. 如果新片段是全新的信息，选择"create_new"
        3. 如果新片段不重要或重复，选择"ignore"

        请用JSON格式返回，包含"decision"字段和可选的"reason"字段。
        示例: {{"decision": "merge_with:1", "reason": "理由"}}
        """

        try:
            completion = self.client.chat.completions.create(
                model="qwen-plus",
                messages=[
                    {"role": "system", "content": "你是一个专业的记忆管理助手，能够智能地决定如何整合记忆。"},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )

            response = json.loads(completion.choices[0].message.content)
            return response.get("decision", "create_new"), response.get("reason", "")

        except Exception as e:
            print(f"记忆整合决策失败: {e}")
            return "create_new", "决策失败，默认创建新记忆"

    def update_memory(self, fragment, fragment_embedding, decision, similar_memory_idx=None):
        """根据决策更新记忆"""
        current_time = int(datetime.now().timestamp())
        fragment_norm = np.linalg.norm(fragment_embedding).astype(np.float16)

        if decision == "create_new":
            # 创建新记忆
            new_memory = {
                "vector": fragment_embedding.tolist(),
                "norm": fragment_norm,
                "text": fragment,
                "frequency": 1,
                "created_at": current_time,
                "updated_at": current_time
            }
            self.memories.append(new_memory)
            print(f"创建新记忆: {fragment}")

        elif decision.startswith("merge_with:") and similar_memory_idx is not None:
            # 合并到现有记忆
            memory_idx = similar_memory_idx
            if memory_idx < len(self.memories):
                # 使用LLM合并记忆内容
                merged_text = self.merge_memories(self.memories[memory_idx]["text"], fragment)

                self.memories[memory_idx]["text"] = merged_text
                self.memories[memory_idx]["updated_at"] = current_time
                self.memories[memory_idx]["frequency"] += 1
                print(f"合并记忆: {fragment} -> 现有记忆#{memory_idx}")

        # 如果decision是"ignore"，则不进行任何操作
        elif decision == "ignore":
            print(f"忽略记忆片段: {fragment}")

    def merge_memories(self, existing_memory, new_fragment):
        """使用LLM合并两个记忆"""
        prompt = f"""
        请将以下两个相关的记忆片段合并成一个连贯、简洁的记忆。
        保留所有重要信息，去除冗余内容。

        现有记忆: "{existing_memory}"
        新记忆片段: "{new_fragment}"

        请直接返回合并后的记忆文本，不要有其他内容。
        """

        try:
            completion = self.client.chat.completions.create(
                model="qwen-plus",
                messages=[
                    {"role": "system", "content": "你擅长将相关信息合并成简洁连贯的记忆。"},
                    {"role": "user", "content": prompt}
                ]
            )

            return completion.choices[0].message.content.strip()

        except Exception as e:
            print(f"记忆合并失败: {e}")
            return f"{existing_memory} | {new_fragment}"  # 失败时简单拼接

    # 将 OpenAI 消息列表转换为多行字符串格式，适配 process_chat_history
    def format_messages_to_chat_history(self, messages):
        if not messages:
            return ""

        lines = []
        for msg in messages:
            role = msg.get("role", "").lower()
            content = msg.get("content", "").strip()

            if not content:
                continue  # 跳过空内容

            # 映射角色
            if role == "user":
                speaker = "用户"
            elif role == "assistant":
                speaker = "AI"
            else:
                continue  # 忽略 system 或其他角色（可选保留）

            lines.append(f"{speaker}: {content}")

        return "\n".join(lines)

    def process_chat_history(self, chat_history):
        """处理聊天历史并更新记忆"""
        print("开始处理聊天历史...")
        chat_history = self.format_messages_to_chat_history(chat_history)
        # 1. 加载记忆（根据memory_version决定是否从URL加载）
        self.load_memories()
        print(f"当前记忆库大小: {len(self.memories)} 条记忆")

        # 2. 提取记忆片段
        fragments = self.extract_memory_fragments(chat_history)
        print(f"提取到 {len(fragments)} 个记忆片段")

        if not fragments:
            print("没有提取到记忆片段，终止处理")
            return

        # 3. 为每个片段生成嵌入向量
        fragment_embeddings = self.get_embeddings(fragments)
        print(f"提取到 {len(fragment_embeddings)} 个嵌入向量")
        if not fragment_embeddings or len(fragment_embeddings) != len(fragments):
            print("嵌入向量生成失败，终止处理")
            return

        # 4. 处理每个记忆片段
        for i, (fragment, embedding) in enumerate(zip(fragments, fragment_embeddings)):
            print(f"\n处理片段 {i + 1}/{len(fragments)}: {fragment[:50]}...")

            # 5. 搜索相似记忆（只有在有现有记忆时才搜索）
            similar_memories = []
            if self.memories:
                similar_memories = self.search_similar_memories(embedding, k=5, threshold=0.7)
                print(f"找到 {len(similar_memories)} 个相似记忆")
            else:
                print("记忆库为空，无需搜索相似记忆")

            # 6. 决定如何整合
            decision, reason = self.decide_memory_integration(fragment, similar_memories)
            print(f"决策: {decision}, 理由: {reason}")

            # 7. 执行更新
            if decision.startswith("merge_with:"):
                # 提取要合并的记忆索引
                try:
                    merge_idx = int(decision.split(":")[1]) - 1
                    # 找到对应的实际记忆索引
                    if merge_idx < len(similar_memories):
                        actual_idx = similar_memories[merge_idx][0]
                        self.update_memory(fragment, embedding, decision, actual_idx)
                    else:
                        self.update_memory(fragment, embedding, "create_new", None)
                except (IndexError, ValueError):
                    self.update_memory(fragment, embedding, "create_new", None)
            else:
                self.update_memory(fragment, embedding, decision, None)

        # 8. 保存更新后的记忆
        success = self.save_memories()
        if success:
            print(f"记忆处理完成! 新版本号: {self.memory_version}")
        else:
            print("记忆处理完成，但保存失败!")


# 使用示例
def main():
    # 示例1: memory_version = 0 (新用户)
    print("=== 示例1: memory_version = 0 (新用户) ===")
    avatar_id = "avatar_123"
    memory_version = 0
    chat_history = [
        {"role": "user", "content": "你好，我叫张三，来自北京"},
        {"role": "assistant", "content": "你好张三！很高兴认识你。北京是个美丽的城市"},
        {"role": "user", "content": "是的，我住在朝阳区，工作在中关村"},
        {"role": "assistant", "content": "朝阳区很繁华呢。你在中关村做什么工作？"},
        {"role": "user", "content": "我是一名软件工程师，主要做人工智能相关的工作"},
        {"role": "assistant", "content": "很酷的职业！人工智能领域现在发展非常迅速"}
    ]

    memory_manager = MemoryManager(avatar_id, memory_version)
    memory_manager.process_chat_history(chat_history)

    # 示例2: memory_version > 0 (已有记忆的用户)
    print("\n=== 示例2: memory_version = 1 (已有记忆的用户) ===")
    memory_version = 1
    new_chat_history = [
        {"role": "user", "content": "最近我在学习深度学习"},
        {"role": "assistant", "content": "很棒！深度学习是人工智能的重要分支"},
        {"role": "user", "content": "是的，我还在朝阳区住，但换到了望京工作"},
        {"role": "assistant", "content": "望京是北京新兴的科技中心呢，这次工作变动听起来很令人兴奋"}
    ]

    memory_manager2 = MemoryManager(avatar_id, memory_version)
    memory_manager2.process_chat_history(new_chat_history)


if __name__ == "__main__":
    main()