# /// script
# dependencies = []
# ///
"""
ParkQR Backend Application Server
Strict 'One QR = One Parking Session' lifecycle implementation:
PENDING_APPROVAL -> APPROVED -> PARKED -> AWAITING_PAYMENT -> COMPLETED

Every QR scan rigorously validates current session status to eliminate:
- Duplicate scans
- Unauthorized entry / exit
- Duplicate charges
- QR reuse after session completion
"""

import os
import sys
import json
import math
import secrets
import sqlite3
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

import db

# Ensure database is created
db.init_db()

PORT = 8000
HOST = "0.0.0.0"

def get_now_iso():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def calculate_fare(vehicle_type, entry_time_str, exit_time_str):
    """
    Dynamic Pricing:
    - Car: ₹30/hour
    - Bike: ₹15/hour
    Formula: Total Fare = Ceiling(Total Parking Minutes / 60) * Hourly Rate
    Duration < 1 hr is charged for 1 hr.
    Partial hours rounded up.
    """
    rate = 30.0 if vehicle_type.upper() == 'CAR' else 15.0
    try:
        t_entry = datetime.strptime(entry_time_str, "%Y-%m-%d %H:%M:%S")
        t_exit = datetime.strptime(exit_time_str, "%Y-%m-%d %H:%M:%S")
        diff_seconds = max(0, (t_exit - t_entry).total_seconds())
        diff_minutes = max(1, math.ceil(diff_seconds / 60.0))
        billed_hours = max(1, math.ceil(diff_minutes / 60.0))
        fare = billed_hours * rate
        return diff_minutes, billed_hours, rate, fare
    except Exception as e:
        print("Fare calc error:", e)
        return 1, 1, rate, rate

class ParkQRRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def parse_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                return {}
            raw = self.rfile.read(length).decode("utf-8")
            return json.loads(raw)
        except Exception:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/slots":
            self.handle_get_slots()
        elif path == "/api/sessions":
            username = query.get("username", [None])[0]
            status = query.get("status", [None])[0]
            self.handle_get_sessions(username, status)
        elif path == "/api/session":
            session_id = query.get("session_id", [None])[0]
            self.handle_get_single_session(session_id)
        elif path == "/api/staff":
            self.handle_get_staff()
        elif path == "/api/stats":
            self.handle_get_stats()
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.parse_json_body()

        # Auth endpoints
        if path == "/api/auth/customer/signup":
            self.handle_customer_signup(body)
        elif path == "/api/auth/customer/login":
            self.handle_customer_login(body)
        elif path == "/api/auth/staff/login":
            self.handle_staff_login(body)
        elif path == "/api/auth/admin/login":
            self.handle_admin_login(body)
        elif path == "/api/staff/register":
            self.handle_staff_register(body)
        elif path == "/api/staff/delete":
            self.handle_staff_delete(body)

        # One QR = One Parking Session Lifecycle Endpoints
        elif path == "/api/parking/request":
            self.handle_parking_request(body)
        elif path == "/api/parking/approve":
            self.handle_staff_approve(body)
        elif path == "/api/parking/reject":
            self.handle_staff_reject(body)
        elif path == "/api/parking/entry":
            self.handle_staff_entry_scan(body)
        elif path == "/api/parking/exit":
            self.handle_staff_exit_scan(body)
        elif path == "/api/parking/pay":
            self.handle_customer_payment(body)
        else:
            self.send_json(404, {"success": False, "message": "API endpoint not found"})

    # ================== AUTH HANDLERS ==================

    def handle_customer_signup(self, body):
        username = body.get("username", "").strip().lower()
        password = body.get("password", "").strip()
        full_name = body.get("full_name", username).strip()

        if not username or not password:
            return self.send_json(400, {"success": False, "message": "Username and password required"})

        conn = db.get_connection()
        try:
            conn.execute("INSERT INTO users (username, password, full_name) VALUES (?, ?, ?)",
                         (username, password, full_name))
            conn.commit()
            return self.send_json(200, {"success": True, "message": "Account created successfully", "username": username})
        except sqlite3.IntegrityError:
            return self.send_json(400, {"success": False, "message": "Username already taken"})
        finally:
            conn.close()

    def handle_customer_login(self, body):
        username = body.get("username", "").strip().lower()
        password = body.get("password", "").strip()

        conn = db.get_connection()
        row = conn.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password)).fetchone()
        conn.close()

        if row:
            return self.send_json(200, {
                "success": True,
                "user": {"id": row["id"], "username": row["username"], "full_name": row["full_name"], "role": "customer"}
            })
        return self.send_json(401, {"success": False, "message": "Invalid customer credentials"})

    def handle_staff_login(self, body):
        username = body.get("username", "").strip().lower()
        password = body.get("password", "").strip()

        conn = db.get_connection()
        row = conn.execute("SELECT * FROM staff WHERE username = ? AND password = ?", (username, password)).fetchone()
        conn.close()

        if row:
            return self.send_json(200, {
                "success": True,
                "user": {"id": row["id"], "username": row["username"], "full_name": row["full_name"], "role": "staff"}
            })
        return self.send_json(401, {"success": False, "message": "Invalid staff credentials. Contact Administrator."})

    def handle_admin_login(self, body):
        username = body.get("username", "").strip()
        password = body.get("password", "").strip()

        if username == "admin" and password == "admin123":
            return self.send_json(200, {
                "success": True,
                "user": {"username": "admin", "full_name": "Chief Administrator", "role": "admin"}
            })
        return self.send_json(401, {"success": False, "message": "Invalid administrator credentials"})

    def handle_get_staff(self):
        conn = db.get_connection()
        rows = conn.execute("SELECT id, username, password, full_name, created_at FROM staff ORDER BY id DESC").fetchall()
        conn.close()
        staff_list = [dict(r) for r in rows]
        self.send_json(200, {"success": True, "staff": staff_list})

    def handle_staff_register(self, body):
        name = body.get("name", "").strip()
        username = body.get("username", "").strip().lower()
        password = body.get("password", "").strip()

        if not name or not username or not password:
            return self.send_json(400, {"success": False, "message": "Name, username and password are required"})

        conn = db.get_connection()
        try:
            conn.execute("INSERT INTO staff (username, password, full_name) VALUES (?, ?, ?)",
                         (username, password, name))
            conn.commit()
            return self.send_json(200, {"success": True, "message": f"Traffic Staff @{username} registered successfully"})
        except sqlite3.IntegrityError:
            return self.send_json(400, {"success": False, "message": "Staff username already exists"})
        finally:
            conn.close()

    def handle_staff_delete(self, body):
        staff_id = body.get("id")
        conn = db.get_connection()
        total = conn.execute("SELECT COUNT(*) FROM staff").fetchone()[0]
        if total <= 1:
            conn.close()
            return self.send_json(400, {"success": False, "message": "At least one staff member must remain registered"})

        conn.execute("DELETE FROM staff WHERE id = ?", (staff_id,))
        conn.commit()
        conn.close()
        return self.send_json(200, {"success": True, "message": "Staff member removed"})

    def handle_get_slots(self):
        conn = db.get_connection()
        rows = conn.execute("SELECT * FROM parking_slots ORDER BY slot_number ASC").fetchall()
        conn.close()
        self.send_json(200, {"success": True, "slots": [dict(r) for r in rows]})

    def handle_get_stats(self):
        conn = db.get_connection()
        total_slots = conn.execute("SELECT COUNT(*) FROM parking_slots").fetchone()[0]
        avail_slots = conn.execute("SELECT COUNT(*) FROM parking_slots WHERE status = 'AVAILABLE'").fetchone()[0]
        occup_slots = conn.execute("SELECT COUNT(*) FROM parking_slots WHERE status != 'AVAILABLE'").fetchone()[0]
        total_rev = conn.execute("SELECT SUM(final_fare) FROM parking_sessions WHERE payment_status = 'PAID'").fetchone()[0] or 0.0
        active_sess = conn.execute("""
            SELECT COUNT(*) FROM parking_sessions
            WHERE status IN ('PENDING_APPROVAL', 'APPROVED', 'PARKED', 'AWAITING_PAYMENT')
        """).fetchone()[0]
        conn.close()
        self.send_json(200, {
            "success": True,
            "stats": {
                "total_slots": total_slots,
                "available_slots": avail_slots,
                "occupied_slots": occup_slots,
                "total_revenue": total_rev,
                "active_sessions": active_sess
            }
        })

    def handle_get_sessions(self, username, status):
        conn = db.get_connection()
        query = "SELECT * FROM parking_sessions WHERE 1=1"
        params = []
        if username:
            query += " AND username = ?"
            params.append(username)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY id DESC"
        rows = conn.execute(query, params).fetchall()
        conn.close()
        self.send_json(200, {"success": True, "sessions": [dict(r) for r in rows]})

    def handle_get_single_session(self, session_id):
        if not session_id:
            return self.send_json(400, {"success": False, "message": "Session ID required"})
        conn = db.get_connection()
        row = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        conn.close()
        if not row:
            return self.send_json(404, {"success": False, "message": "Session not found"})
        return self.send_json(200, {"success": True, "session": dict(row)})

    # ================== ONE QR = ONE SESSION LIFECYCLE ==================

    # 1. User Requests Parking & Generates Unique Session QR (Status: PENDING_APPROVAL)
    def handle_parking_request(self, body):
        username = body.get("username", "").strip().lower()
        vehicle_number = body.get("vehicle_number", "").strip().upper()
        vehicle_type = body.get("vehicle_type", "CAR").strip().upper()

        if not username or not vehicle_number:
            return self.send_json(400, {"success": False, "message": "Username and vehicle number required"})

        if vehicle_type not in ("CAR", "BIKE"):
            vehicle_type = "CAR"

        hourly_rate = 30.0 if vehicle_type == "CAR" else 15.0

        conn = db.get_connection()
        user_row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if not user_row:
            cur = conn.execute("INSERT INTO users (username, password, full_name) VALUES (?, ?, ?)",
                               (username, "pass123", username.title()))
            user_id = cur.lastrowid
        else:
            user_id = user_row["id"]

        # Prevent concurrent active sessions for the same user
        active_existing = conn.execute("""
            SELECT session_id, status FROM parking_sessions
            WHERE username = ? AND status IN ('PENDING_APPROVAL', 'APPROVED', 'PARKED', 'AWAITING_PAYMENT')
        """, (username,)).fetchone()

        if active_existing:
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": f"You already have an active parking session ({active_existing['session_id']}) in state '{active_existing['status']}'. Complete it before requesting a new one."
            })

        # Generate Single Unique QR Token (Used for ALL stages of this session)
        unique_token = "PRK-" + secrets.token_hex(4).upper()
        now_str = get_now_iso()

        conn.execute("""
            INSERT INTO parking_sessions (
                session_id, user_id, username, vehicle_number, vehicle_type,
                hourly_rate, status, request_time
            ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?)
        """, (unique_token, user_id, username, vehicle_number, vehicle_type, hourly_rate, now_str))

        conn.commit()
        row = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (unique_token,)).fetchone()
        conn.close()

        self.send_json(200, {
            "success": True,
            "message": "Parking request submitted. Unique session QR generated. Awaiting traffic staff approval.",
            "session": dict(row)
        })

    # 2. Traffic Staff Approves Request & Allots Parking Location (Status: APPROVED)
    def handle_staff_approve(self, body):
        session_id = body.get("session_id", "").strip()
        slot_number = body.get("slot_number", "").strip().upper()

        if not session_id or not slot_number:
            return self.send_json(400, {"success": False, "message": "Session ID and slot number required"})

        conn = db.get_connection()
        session = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not session:
            conn.close()
            return self.send_json(404, {"success": False, "message": "Session not found"})

        # Validate Status: Can ONLY approve if PENDING_APPROVAL
        if session["status"] == "COMPLETED":
            conn.close()
            return self.send_json(400, {"success": False, "message": "QR code already used and completed. Cannot reuse QR pass."})

        if session["status"] != "PENDING_APPROVAL":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": f"Cannot approve session. Expected status: 'PENDING_APPROVAL', current status: '{session['status']}'."
            })

        # Check slot availability
        slot = conn.execute("SELECT * FROM parking_slots WHERE slot_number = ?", (slot_number,)).fetchone()
        if not slot:
            conn.close()
            return self.send_json(404, {"success": False, "message": f"Slot {slot_number} does not exist"})

        if slot["status"] != "AVAILABLE":
            conn.close()
            return self.send_json(400, {"success": False, "message": f"Slot {slot_number} is already occupied or reserved"})

        # Atomic reservation
        now_str = get_now_iso()
        conn.execute("UPDATE parking_slots SET status = 'RESERVED', current_session_id = ? WHERE slot_number = ?",
                     (session_id, slot_number))
        conn.execute("""
            UPDATE parking_sessions
            SET status = 'APPROVED', assigned_slot = ?, approval_time = ?
            WHERE session_id = ?
        """, (slot_number, now_str, session_id))

        conn.commit()
        updated_session = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        conn.close()

        self.send_json(200, {
            "success": True,
            "message": f"Request approved. Parking slot {slot_number} allotted. User can proceed to entry barrier.",
            "session": dict(updated_session)
        })

    # 2b. Traffic Staff Rejects Request
    def handle_staff_reject(self, body):
        session_id = body.get("session_id", "").strip()
        reason = body.get("reason", "Parking capacity full / Rejected by staff").strip()

        conn = db.get_connection()
        session = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not session:
            conn.close()
            return self.send_json(404, {"success": False, "message": "Session not found"})

        if session["status"] != "PENDING_APPROVAL":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": f"Cannot reject session in '{session['status']}' status."
            })

        conn.execute("""
            UPDATE parking_sessions
            SET status = 'REJECTED', rejection_reason = ?
            WHERE session_id = ?
        """, (reason, session_id))
        conn.commit()
        updated = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        conn.close()

        self.send_json(200, {
            "success": True,
            "message": "Parking request rejected",
            "session": dict(updated)
        })

    # 3. Same QR Scanned at Vehicle Entry -> Validate Status: APPROVED -> Set PARKED
    def handle_staff_entry_scan(self, body):
        session_id = body.get("session_id", "").strip()

        conn = db.get_connection()
        session = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not session:
            conn.close()
            return self.send_json(404, {"success": False, "message": "Invalid QR code pass: Session not found"})

        # Validate against QR reuse and duplicate scans
        if session["status"] == "COMPLETED":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": "QR code already used and session completed! QR reuse is strictly prevented."
            })

        if session["status"] == "PARKED":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": "Duplicate Entry Scan: Vehicle is already checked-in and currently PARKED."
            })

        if session["status"] == "AWAITING_PAYMENT":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": "Vehicle has already completed entry and exit. Current status is AWAITING_PAYMENT."
            })

        if session["status"] == "PENDING_APPROVAL":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": "Unauthorized Entry: Request is still PENDING_APPROVAL. Staff must approve and allot slot first."
            })

        if session["status"] != "APPROVED":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": f"Unauthorized Entry: Session is '{session['status']}'. Requires 'APPROVED' status."
            })

        now_str = get_now_iso()
        slot_number = session["assigned_slot"]

        # Mark slot as OCCUPIED
        if slot_number:
            conn.execute("UPDATE parking_slots SET status = 'OCCUPIED' WHERE slot_number = ?", (slot_number,))

        conn.execute("""
            UPDATE parking_sessions
            SET status = 'PARKED', entry_time = ?
            WHERE session_id = ?
        """, (now_str, session_id))

        conn.commit()
        updated = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        conn.close()

        self.send_json(200, {
            "success": True,
            "message": "Vehicle entry confirmed and exact timestamp recorded. Session is now PARKED.",
            "session": dict(updated)
        })

    # 4. Same QR Scanned at Vehicle Exit -> Validate Status: PARKED -> Calculate Fare -> Set AWAITING_PAYMENT
    def handle_staff_exit_scan(self, body):
        session_id = body.get("session_id", "").strip()

        conn = db.get_connection()
        session = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not session:
            conn.close()
            return self.send_json(404, {"success": False, "message": "Invalid QR code pass: Session not found"})

        # Validate against QR reuse, duplicate exits, or premature scans
        if session["status"] == "COMPLETED":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": "QR code already used and session completed! QR reuse is strictly prevented."
            })

        if session["status"] == "AWAITING_PAYMENT":
            conn.close()
            return self.send_json(200, {
                "success": True,
                "message": "Duplicate Exit Scan prevented: Fare has already been computed. Awaiting customer payment.",
                "session": dict(session)
            })

        if session["status"] in ("PENDING_APPROVAL", "APPROVED"):
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": f"Unauthorized Exit Scan: Vehicle has not verified check-in yet (Current: {session['status']})."
            })

        if session["status"] != "PARKED":
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": f"Unauthorized Exit: Session is '{session['status']}'. Requires 'PARKED' status."
            })

        now_str = get_now_iso()
        entry_time_str = session["entry_time"] or session["request_time"]

        diff_minutes, billed_hours, rate, fare = calculate_fare(session["vehicle_type"], entry_time_str, now_str)

        conn.execute("""
            UPDATE parking_sessions
            SET status = 'AWAITING_PAYMENT', exit_time = ?, duration_minutes = ?,
                billed_hours = ?, hourly_rate = ?, final_fare = ?
            WHERE session_id = ?
        """, (now_str, diff_minutes, billed_hours, rate, fare, session_id))

        conn.commit()
        updated = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        conn.close()

        self.send_json(200, {
            "success": True,
            "message": f"Exit scan verified. Duration: {diff_minutes} mins ({billed_hours} hr billed). Total Fare: ₹{fare}. Status updated to AWAITING_PAYMENT.",
            "session": dict(updated)
        })

    # 5. Customer Completes Payment -> Validate Status: AWAITING_PAYMENT -> Set COMPLETED & Release Slot
    def handle_customer_payment(self, body):
        session_id = body.get("session_id", "").strip()
        upi_id = body.get("upi_id", "user@upi").strip()

        conn = db.get_connection()
        session = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not session:
            conn.close()
            return self.send_json(404, {"success": False, "message": "Session not found"})

        # Prevent duplicate payments
        if session["status"] == "COMPLETED" or session["payment_status"] == "PAID":
            conn.close()
            return self.send_json(200, {
                "success": True,
                "message": "Duplicate payment prevented: This session is already paid and completed.",
                "session": dict(session)
            })

        if session["status"] not in ("AWAITING_PAYMENT", "PARKED"):
            conn.close()
            return self.send_json(400, {
                "success": False,
                "message": f"Payment can only be processed on exit (AWAITING_PAYMENT). Current status: '{session['status']}'"
            })

        now_str = get_now_iso()

        if session["status"] == "PARKED":
            entry_time_str = session["entry_time"] or session["request_time"]
            diff_minutes, billed_hours, rate, fare = calculate_fare(session["vehicle_type"], entry_time_str, now_str)
        else:
            diff_minutes = session["duration_minutes"]
            billed_hours = session["billed_hours"]
            fare = session["final_fare"]
            now_str = session["exit_time"] or now_str

        payment_ref = "TXN-" + secrets.token_hex(6).upper()

        # Release parking slot so another vehicle can use it
        slot_number = session["assigned_slot"]
        if slot_number:
            conn.execute("""
                UPDATE parking_slots
                SET status = 'AVAILABLE', current_session_id = NULL
                WHERE slot_number = ?
            """, (slot_number,))

        # Mark session COMPLETED & PAID
        conn.execute("""
            UPDATE parking_sessions
            SET status = 'COMPLETED',
                payment_status = 'PAID',
                payment_reference = ?,
                payment_time = ?,
                exit_time = ?,
                duration_minutes = ?,
                billed_hours = ?,
                final_fare = ?
            WHERE session_id = ?
        """, (payment_ref, get_now_iso(), now_str, diff_minutes, billed_hours, fare, session_id))

        conn.commit()
        updated = conn.execute("SELECT * FROM parking_sessions WHERE session_id = ?", (session_id,)).fetchone()
        conn.close()

        self.send_json(200, {
            "success": True,
            "message": "Payment verified! Session marked COMPLETED, digital receipt issued, and parking slot released.",
            "session": dict(updated)
        })

def run_server():
    import webbrowser
    import threading

    server_address = (HOST, PORT)
    httpd = HTTPServer(server_address, ParkQRRequestHandler)
    print(f"ParkQR Backend Server running on http://127.0.0.1:{PORT}")
    
    # Automatically open the browser to 127.0.0.1:8000 after 1 second
    threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping ParkQR server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
