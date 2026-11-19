# /// script
# dependencies = []
# ///
"""
ParkQR Database Layer
SQLite schema and repository operations for parking sessions, users, staff, and slots.
Workflow States:
PENDING_APPROVAL -> APPROVED -> PARKED -> AWAITING_PAYMENT -> COMPLETED
"""

import os
import sys
import sqlite3
from datetime import datetime

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

DB_PATH = os.path.join(CURRENT_DIR, "parking.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Users table (Customer accounts)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 2. Staff table (Registered exclusively by Admin)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 3. Parking Slots table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parking_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slot_number TEXT UNIQUE NOT NULL,
            slot_type TEXT NOT NULL, -- 'CAR' or 'BIKE'
            status TEXT NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'RESERVED', 'OCCUPIED'
            current_session_id TEXT DEFAULT NULL
        )
    """)

    # 4. Parking Sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parking_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE NOT NULL, -- Unique QR Code content, e.g. PRK-XXXXXX
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            vehicle_number TEXT NOT NULL,
            vehicle_type TEXT NOT NULL, -- 'CAR' or 'BIKE'
            hourly_rate REAL NOT NULL, -- 30.0 for CAR, 15.0 for BIKE
            assigned_slot TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL', -- 'PENDING_APPROVAL', 'APPROVED', 'PARKED', 'AWAITING_PAYMENT', 'COMPLETED', 'REJECTED'
            rejection_reason TEXT DEFAULT NULL,
            request_time TEXT NOT NULL,
            approval_time TEXT DEFAULT NULL,
            entry_time TEXT DEFAULT NULL,
            exit_time TEXT DEFAULT NULL,
            duration_minutes INTEGER DEFAULT 0,
            billed_hours INTEGER DEFAULT 0,
            final_fare REAL DEFAULT 0.0,
            payment_status TEXT NOT NULL DEFAULT 'UNPAID', -- 'UNPAID', 'PAID'
            payment_reference TEXT DEFAULT NULL,
            payment_time TEXT DEFAULT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # Pre-seed initial accounts if empty
    cursor.execute("SELECT COUNT(*) FROM staff")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO staff (username, password, full_name) VALUES (?, ?, ?)",
                       ("officer1", "staff123", "Traffic Officer 01"))

    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO users (username, password, full_name) VALUES (?, ?, ?)",
                       ("alex", "alex123", "Alex Smith"))

    cursor.execute("SELECT COUNT(*) FROM parking_slots")
    if cursor.fetchone()[0] == 0:
        initial_slots = [
            ('C-01', 'CAR', 'AVAILABLE'),
            ('C-02', 'CAR', 'AVAILABLE'),
            ('C-03', 'CAR', 'AVAILABLE'),
            ('C-04', 'CAR', 'AVAILABLE'),
            ('C-05', 'CAR', 'AVAILABLE'),
            ('C-06', 'CAR', 'AVAILABLE'),
            ('B-01', 'BIKE', 'AVAILABLE'),
            ('B-02', 'BIKE', 'AVAILABLE'),
            ('B-03', 'BIKE', 'AVAILABLE'),
            ('B-04', 'BIKE', 'AVAILABLE')
        ]
        cursor.executemany("INSERT INTO parking_slots (slot_number, slot_type, status) VALUES (?, ?, ?)", initial_slots)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database verified at", DB_PATH)
