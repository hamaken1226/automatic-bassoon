import streamlit as st
import pandas as pd
from openai import OpenAI
from google.oauth2 import service_account
from googleapiclient.discovery import build
import gspread

# --- Secretsから秘密情報を取得 ---
# Streamlit Cloudの設定画面で入力した値を使います
api_key = st.secrets["OPENAI_API_KEY"]
google_credentials = st.secrets["gcp_service_account"]

# --- 各種クライアントの初期化 ---
client = OpenAI(api_key=api_key)
creds = service_account.Credentials.from_service_account_info(google_credentials)
scoped_creds = creds.with_scopes([
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
])
gc = gspread.authorize(scoped_creds)
drive_service = build('drive', 'v3', credentials=scoped_creds)

# --- スプレッドシート操作用の関数 ---
def save_log_to_sheets(data):
    # 名前でシートを開く
    sheet = gc.open("English_AI_Logs").sheet1
    sheet.append_row(data)

def get_user_history(user_id):
    # 過去のそのユーザーのデータを取得して分析に使う
    sheet = gc.open("English_AI_Logs").sheet1
    all_records = pd.DataFrame(sheet.get_all_records())
    if not all_records.empty:
        return all_records[all_records['user_id'] == user_id]
    return pd.DataFrame()

# --- メインロジック（ここにこれまでの10問テストのコードを入れる） ---
# st.session_state でステップ管理
# 録音が終わるたびに save_log_to_sheets() を呼び出す
