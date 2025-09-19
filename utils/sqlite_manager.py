import sqlite3
import os
from typing import Dict, Any, Optional

# 数据库文件路径
DB_FILE = 'users.db'

# 初始化数据库（如果不存在则创建）
def init_db():
    print("init_db")
    if not os.path.exists(DB_FILE):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        # 创建background表
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS background (
            bg_id TEXT PRIMARY KEY,
            unionid TEXT NOT NULL,
            is_video INTEGER NOT NULL,
            bg_url TEXT NOT NULL,
            thumbnail_url TEXT NOT NULL
        );
        """)

        # 创建 roles 表
        cursor.execute('''CREATE TABLE IF NOT EXISTS roles (
            avatar_id TEXT PRIMARY KEY,
            unionid TEXT,
            avatar_name TEXT,
            avatar_url TEXT,
            cosyvoice_id TEXT,
            system_prompt TEXT,
            memory_prompt_url TEXT,
            memory_version INTEGER DEFAULT 0,
            video_url TEXT,
            video_asset_url TEXT,
            image_asset_url TEXT,
            bg_id TEXT,
            created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            version INTEGER DEFAULT 1,
            chat_count INTEGER DEFAULT 0
        )''')

        # 创建 voices 表
        cursor.execute('''CREATE TABLE IF NOT EXISTS voices (
            voice_id TEXT PRIMARY KEY,
            unionid TEXT,
            cosyvoice_id TEXT,
            voice_name TEXT,
            voice_url TEXT,
            clone_voice_url TEXT,
            created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')

        # 创建 users 表
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            unionid TEXT PRIMARY KEY,                          /* 用户的唯一标识unionid */
            nickname TEXT,                                     /* 用户昵称 */
            created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  /* 创建时间，默认为当前时间 */
            updated_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP   /* 更新时间，默认为当前时间 */
        )''')

        conn.commit()
        conn.close()
        print(f"数据库 {DB_FILE} 已创建并初始化。")
    else:
        print(f"数据库 {DB_FILE} 已存在。")


# 获取数据库连接
def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row  # 使查询结果以字典形式返回
    return conn


def query_data(table: str, columns: Optional[list] = None,
               condition: Optional[str] = None, params: Optional[tuple] = None) -> list:
    """
    查询数据
    :param table: 表名
    :param columns: 要查询的列名列表 (None表示所有列)
    :param condition: WHERE条件语句 (可选，包含占位符)
    :param params: WHERE条件的参数元组 (可选)
    :return: 结果字典列表
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # 处理列选择
        column_str = '*' if not columns else ', '.join(columns)

        # 构建SQL语句
        sql = f"SELECT {column_str} FROM {table}"
        if condition:
            sql += f" WHERE {condition}"
        # 执行查询
        cursor.execute(sql, params or ())
        results = [dict(row) for row in cursor.fetchall()]
        return results
    except sqlite3.Error as e:
        print(f"查询数据错误: {e}")
        return []
    finally:
        conn.close()


def delete_data(table: str, condition: str, params: tuple) -> int:
    """
    删除表中数据
    :param table: 表名
    :param condition: WHERE条件语句 (包含占位符)
    :param params: WHERE条件的参数元组
    :return: 受影响的行数
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        sql = f"DELETE FROM {table} WHERE {condition}"
        cursor.execute(sql, params)
        conn.commit()
        return cursor.rowcount
    except sqlite3.Error as e:
        print(f"删除数据错误: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()


# 检查用户是否存在
def check_new_user(unionid):
    results = query_data("users", condition="unionid = ?", params=(unionid,))
    if len(results) == 0:
        return True
    else:
        return False


def insert_or_update_table(table_name, **kwargs):
    if table_name == "users":
        ALLOWED_FIELDS = {
            "unionid", "nickname"
        }
        NECESSARY_KEYS = {"unionid"}
    elif table_name == "roles":
        ALLOWED_FIELDS = {
            "avatar_id", "unionid", "avatar_name", "avatar_url", "cosyvoice_id",
            "system_prompt", "memory_prompt_url", "memory_version", "video_url", "video_asset_url", "image_asset_url",
            "chat_count"
        }
        NECESSARY_KEYS = {"avatar_id"}
    elif table_name == "voices":
        ALLOWED_FIELDS = {
            "voice_id", "unionid", "cosyvoice_id", "voice_name", "voice_url", "clone_voice_url"
        }
        NECESSARY_KEYS = {"voice_id"}
    elif table_name == "background":
        ALLOWED_FIELDS = {
            "bg_id","unionid","is_video","bg_url","thumbnail_url"
        }
        NECESSARY_KEYS = {"bg_id"}
    else:
        raise ValueError("Invalid table_name")

    # 过滤非法字段和空值
    filtered = {
        k: v for k, v in kwargs.items() if k in ALLOWED_FIELDS and v is not None
    }

    if not NECESSARY_KEYS.issubset(filtered.keys()):
        raise ValueError("NECESSARY_KEYS are required")

    # 动态生成 SQL 语句
    columns = ", ".join(filtered.keys())
    placeholders = ", ".join(["?"] * len(filtered))
    updates = ", ".join([f"{k}=excluded.{k}" for k in filtered if k not in NECESSARY_KEYS])

    key = list(NECESSARY_KEYS)[0]
    sql = f"""
        INSERT INTO {table_name} ({columns})
        VALUES ({placeholders})
        ON CONFLICT ({key}) DO UPDATE SET
        {updates}
    """
    print(f"insert_or_update_table: {sql}")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(sql, tuple(filtered.values()))
        conn.commit()
        print(f"成功插入/更新 {table_name} 表数据")
    except sqlite3.IntegrityError as e:
        conn.rollback()
        print(f"插入/更新数据错误: {e}")
        raise e
    finally:
        conn.close()


def remove_role_from_roles(unionid: str, avatar_id: str):
    result = delete_data("roles", condition="avatar_id = ? AND unionid = ?", params=(avatar_id, unionid,))
    return result > 0


def get_user_by_unionid(unionid: str) -> Optional[Dict[str, Any]]:
    results = query_data("users", condition="unionid = ?", params=(unionid,))
    if len(results) == 0:
        return None
    else:
        return results[0]


def get_voices_by_unionid(unionid: str) -> list[Dict[str, Any]]:
    results = query_data("voices", condition="unionid = ?", params=(unionid,))
    return results

def get_bgs_by_unionid(unionid: str) -> list[Dict[str, Any]]:
    results = query_data("background", condition="unionid = ?", params=(unionid,))
    return results

def get_roles_by_unionid(unionid: str) -> list[Dict[str, Any]]:
    results = query_data("roles", condition="unionid = ?", params=(unionid,))
    return results


def get_role_by_avatar_id(avatar_id: str, public: str = "private") -> Optional[Dict[str, Any]]:
    results = query_data("roles", condition="avatar_id = ?", params=(avatar_id,))

    if len(results) == 0:
        return None
    else:
        return results[0]


def get_voice_by_voice_id(voice_id: str) -> Optional[Dict[str, Any]]:
    results = query_data("voices", condition="voice_id = ?", params=(voice_id,))
    if len(results) == 0:
        return None
    else:
        return results[0]


# 初始化插入数据函数
def init_insert_data():
    """初始化插入角色和音色数据"""

    # 角色数据
    roles_list = [
        {
            "unionid": "MatesX01",
            "avatar_id": "000",
            "avatar_name": "陆瑾言",
            "cosyvoice_id": "longhua",
            "system_prompt": "儒雅总裁，30岁，成熟稳重，商业精英，擅长战略决策，私下热爱古典文学和品茶。语调沉稳温和，举止得体，偶尔流露幽默感。",
            "avatar_url": "/assets/000/thumbnail.jpg",
            "video_url": "/assets/000/01.webm",
            "video_asset_url": "/assets/000/combined_data.json.gz",
            "memory_prompt_url": "/assets/000/memory.bin",
            "memory_version": 1
        },
        {
            "unionid": "MatesX01",
            "avatar_id": "001",
            "avatar_name": "苏雨菲",
            "cosyvoice_id": "longyue",
            "system_prompt": "知名女歌手，25岁，才华横溢，舞台魅力十足，性格开朗热情，热爱创作和粉丝互动。声音甜美富有感染力，喜欢分享音乐故事。",
            "avatar_url": "/assets/001/thumbnail.jpg",
            "video_url": "/assets/001/01.webm",
            "video_asset_url": "/assets/001/combined_data.json.gz",
            "memory_prompt_url": "/assets/001/memory.bin",
            "memory_version": 1
        },
        {
            "unionid": "MatesX01",
            "avatar_id": "002",
            "avatar_name": "陈梦琪",
            "cosyvoice_id": "longjing",
            "system_prompt": "国际模特，27岁，高冷优雅，时尚感极强，擅长走秀和摄影摆拍。外表冷艳但内心细腻，喜欢旅行和艺术。语调柔和带一丝慵懒。",
            "avatar_url": "/assets/002/thumbnail.jpg",
            "video_url": "/assets/002/01.webm",
            "video_asset_url": "/assets/002/combined_data.json.gz",
            "memory_prompt_url": "/assets/002/memory.bin",
            "memory_version": 0
        },
        {
            "unionid": "MatesX01",
            "avatar_id": "003",
            "avatar_name": "影",
            "cosyvoice_id": "longshuo",
            "system_prompt": "冷酷杀手，年龄未知，沉默寡言，行动果断，背景神秘。擅长潜伏和格斗，偶尔流露一丝人性柔软。声音低沉冰冷，措辞简洁。",
            "avatar_url": "/assets/003/thumbnail.jpg",
            "video_url": "/assets/003/01.webm",
            "video_asset_url": "/assets/003/combined_data.json.gz",
            "memory_prompt_url": "/assets/003/memory.bin",
            "memory_version": 0
        },
        {
            "unionid": "MatesX01",
            "avatar_id": "004",
            "avatar_name": "林小柔",
            "cosyvoice_id": "longmiao",
            "system_prompt": "温柔学妹，20岁，大学生，性格内向善良，热爱学习和帮助他人。声音软糯，容易害羞，喜欢看书和烘焙，充满青春活力。",
            "avatar_url": "/assets/004/thumbnail.jpg",
            "video_url": "/assets/004/01.webm",
            "video_asset_url": "/assets/004/combined_data.json.gz",
            "memory_prompt_url": "/assets/004/memory.bin",
            "memory_version": 0
        },
        {
            "unionid": "MatesX01",
            "avatar_id": "005",
            "avatar_name": "Alexa",
            "cosyvoice_id": "longshu",
            "system_prompt": "混血健身教练，28岁，中英混血，阳光健康，充满活力。专业指导健身，鼓励他人，性格外向热情。语调自信有力，带英语口音。",
            "avatar_url": "/assets/005/thumbnail.jpg",
            "video_url": "/assets/005/01.webm",
            "video_asset_url": "/assets/005/combined_data.json.gz",
            "memory_prompt_url": "/assets/005/memory.bin",
            "memory_version": 0
        },
        {
            "unionid": "MatesX01",
            "avatar_id": "006",
            "avatar_name": "糖心",
            "cosyvoice_id": "longxiaoxia",
            "system_prompt": "网红小妹，22岁，活泼搞怪，擅长直播和短视频，时尚潮流追随者。声音清脆活泼，喜欢分享生活趣事和美妆 tips，充满正能量。",
            "avatar_url": "/assets/006/thumbnail.jpg",
            "video_url": "/assets/006/01.webm",
            "video_asset_url": "/assets/006/combined_data.json.gz",
            "memory_prompt_url": "/assets/006/memory.bin",
            "memory_version": 0
        },
        {
            "unionid": "MatesX01",
            "avatar_id": "007",
            "avatar_name": "沈薇薇",
            "cosyvoice_id": "longwan",
            "system_prompt": "知名女主持，30岁，气质优雅，口才出众，控场能力强。专业且亲和，热爱文化交流和访谈。语调清晰悦耳，措辞得体大方。",
            "avatar_url": "/assets/007/thumbnail.jpg",
            "video_url": "/assets/007/01.webm",
            "video_asset_url": "/assets/007/combined_data.json.gz",
            "memory_prompt_url": "/assets/007/memory.bin",
            "memory_version": 0
        }
    ]

    # 音色数据
    voices_list = [
        {"voice_name": "韵婉",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240830/dzkngm/%E9%BE%99%E5%A9%89.mp3",
         "voice_id": "longwan", "cosyvoice_id": "longwan"},
        {"voice_name": "曦橙",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240830/ggjwfl/%E9%BE%99%E6%A9%99.wav",
         "voice_id": "longcheng", "cosyvoice_id": "longcheng"},
        {"voice_name": "宸华",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240830/jpjtvy/%E9%BE%99%E5%8D%8E.wav",
         "voice_id": "longhua", "cosyvoice_id": "longhua"},
        {"voice_name": "清和",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/rlfvcd/%E9%BE%99%E5%B0%8F%E6%B7%B3.mp3",
         "voice_id": "longxiaochun", "cosyvoice_id": "longxiaochun"},
        {"voice_name": "夏岚",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/wzywtu/%E9%BE%99%E5%B0%8F%E5%A4%8F.mp3",
         "voice_id": "longxiaoxia", "cosyvoice_id": "longxiaoxia"},
        {"voice_name": "诚睿",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/xrqksx/%E9%BE%99%E5%B0%8F%E8%AF%9A.mp3",
         "voice_id": "longxiaocheng", "cosyvoice_id": "longxiaocheng"},
        {"voice_name": "素心",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/vusvze/%E9%BE%99%E5%B0%8F%E7%99%BD.mp3",
         "voice_id": "longxiaobai", "cosyvoice_id": "longxiaobai"},
        {"voice_name": "铁山",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/pfsfir/%E9%BE%99%E8%80%81%E9%93%81.mp3",
         "voice_id": "longlaotie", "cosyvoice_id": "longlaotie"},
        {"voice_name": "墨轩",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/azcerd/%E9%BE%99%E4%B9%A6.mp3",
         "voice_id": "longshu", "cosyvoice_id": "longshu"},
        {"voice_name": "峻峰",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/lcykpl/%E9%BE%99%E7%A1%95.mp3",
         "voice_id": "longshuo", "cosyvoice_id": "longshuo"},
        {"voice_name": "婉清",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/ozkbmb/%E9%BE%99%E5%A9%A7.mp3",
         "voice_id": "longjing", "cosyvoice_id": "longjing"},
        {"voice_name": "灵犀",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/zjnqis/%E9%BE%99%E5%A6%99.mp3",
         "voice_id": "longmiao", "cosyvoice_id": "longmiao"},
        {"voice_name": "欣怡",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/nrkjqf/%E9%BE%99%E6%82%A6.mp3",
         "voice_id": "longyue", "cosyvoice_id": "longyue"},
        {"voice_name": "雅宁",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/xuboos/%E9%BE%99%E5%AA%9B.mp3",
         "voice_id": "longyuan", "cosyvoice_id": "longyuan"},
        {"voice_name": "凌霄",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/bhkjjx/%E9%BE%99%E9%A3%9E.mp3",
         "voice_id": "longfei", "cosyvoice_id": "longfei"},
        {"voice_name": "杰睿",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/dctiyg/%E9%BE%99%E6%9D%B0%E5%8A%9B%E8%B1%AA.mp3",
         "voice_id": "longjielidou", "cosyvoice_id": "longjielidou"},
        {"voice_name": "绯云",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/qyqmvo/%E9%BE%99%E5%BD%A4.mp3",
         "voice_id": "longtong", "cosyvoice_id": "longtong"},
        {"voice_name": "瑞霖",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manare-files/zh-CN/20240624/jybshd/%E9%BE%99%E7%A5%A5.mp3",
         "voice_id": "longxiang", "cosyvoice_id": "longxiang"},
        {"voice_name": "星澜",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/haffms/Stella.mp3",
         "voice_id": "loongstella", "cosyvoice_id": "loongstella"},
        {"voice_name": "贝翎",
         "clone_voice_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20240624/tguine/Bella.mp3",
         "voice_id": "loongbella", "cosyvoice_id": "loongbella"}
    ]

    bg_list = [
    {
        "bg_id": "00",
        "unionid": "MatesX01",
        "is_video": 0,
        "bg_url": "/assets/background/00.jpg",
        "thumbnail_url": "/assets/background/00.jpg"
    },
    {
        "bg_id": "01",
        "unionid": "MatesX01",
        "is_video": 0,
        "bg_url": "/assets/background/01.jpg",
        "thumbnail_url": "/assets/background/01.jpg"
    },
    {
        "bg_id": "02",
        "unionid": "MatesX01",
        "is_video": 0,
        "bg_url": "/assets/background/02.jpg",
        "thumbnail_url": "/assets/background/02.jpg"
    },
    {
        "bg_id": "03",
        "unionid": "MatesX01",
        "is_video": 1,
        "bg_url": "/assets/background/03.mp4",
        "thumbnail_url": "/assets/background/03_thumbnail.jpg"
    },
    {
        "bg_id": "04",
        "unionid": "MatesX01",
        "is_video": 1,
        "bg_url": "/assets/background/04.mp4",
        "thumbnail_url": "/assets/background/04_thumbnail.jpg"
    },
    {
        "bg_id": "05",
        "unionid": "MatesX01",
        "is_video": 1,
        "bg_url": "/assets/background/05.mp4",
        "thumbnail_url": "/assets/background/05_thumbnail.jpg"
    }
    ]

    # 首先创建用户
    try:
        user = {"unionid":"MatesX01", "nickname":"explorer"}
        insert_or_update_table("users", **user)
        print("用户 MatesX01 创建成功")
    except Exception as e:
        print(f"创建用户失败: {e}")

    # 插入角色数据
    role_count = 0
    for role in roles_list:
        try:
            insert_or_update_table("roles", **role)
            role_count += 1
            print(f"角色 {role['avatar_name']} 插入成功")
        except Exception as e:
            print(f"插入角色 {role['avatar_name']} 失败: {e}")

    # 插入音色数据
    voice_count = 0
    for voice in voices_list:
        try:
            # 为音色数据添加 unionid
            voice_with_unionid = voice.copy()
            voice_with_unionid["unionid"] = "MatesX01"
            insert_or_update_table("voices", **voice_with_unionid)
            voice_count += 1
            print(f"音色 {voice['voice_name']} 插入成功")
        except Exception as e:
            print(f"插入音色 {voice['voice_name']} 失败: {e}")

    # 插入背景数据
    bg_count = 0
    for background in bg_list:
        try:
            insert_or_update_table("background", **background)
            bg_count += 1
            print(f"角色 {background['bg_id']} 插入成功")
        except Exception as e:
            print(f"插入角色 {background['bg_id']} 失败: {e}")

    print(f"数据初始化完成！成功插入 {role_count} 个角色和 {voice_count} 个音色和 {bg_count} 个背景")


# 主程序
if __name__ == "__main__":
    # 初始化数据库
    init_db()

    # 插入初始化数据
    init_insert_data()

    # 验证数据插入
    print("\n验证插入的数据:")
    print("用户信息:", get_user_by_unionid("MatesX01"))
    print("角色数量:", len(get_roles_by_unionid("MatesX01")))
    print("音色数量:", len(get_voices_by_unionid("MatesX01")))
    print("背景数量:", len(get_bgs_by_unionid("MatesX01")))