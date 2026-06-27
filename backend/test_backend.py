import os
import sys
import unittest
import csv
import io
from fastapi.testclient import TestClient

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Use temporary SQLite database for testing
os.environ["DATABASE_URL"] = "sqlite:///./test_semiguard.db"

from app.main import app
from app.database.connection import engine, Base

class TestSemiGuardBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create all tables in test database
        Base.metadata.create_all(bind=engine)
        
        # Manually seed database for test run
        from app.main import seed_database
        from app.database.connection import SessionLocal
        db = SessionLocal()
        try:
            seed_database(db)
        finally:
            db.close()
            
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        # Cleanup test DB file
        Base.metadata.drop_all(bind=engine)
        if os.path.exists("test_semiguard.db"):
            try:
                os.remove("test_semiguard.db")
            except Exception:
                pass

    def test_root_endpoint(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "online")

    def test_get_model_performance(self):
        response = self.client.get("/model-performance")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("failure_classifier", data)
        self.assertIn("yield_model", data)
        self.assertIn("rul_model", data)
        self.assertIn("accuracy", data["failure_classifier"])
        self.assertIn("mae", data["yield_model"])
        self.assertIn("r2", data["rul_model"])
        self.assertEqual(len(data["failure_classifier"]["chart"]), 5)

    def test_get_equipment_health(self):
        response = self.client.get("/equipment-health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(len(data) > 0)
        ids = [item["id"] for item in data]
        self.assertIn("WP-01", ids)
        self.assertIn("health", data[0])
        self.assertIn("rul", data[0])

    def test_get_alerts(self):
        response = self.client.get("/alerts")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(len(data) > 0)
        self.assertIn("severity", data[0])
        self.assertIn(data[0]["severity"], {"warning", "critical"})

    def test_get_dashboard_summary(self):
        response = self.client.get("/dashboard-summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("fab_health", data)
        self.assertIn("current_yield", data)
        self.assertIn("yield_trend", data)
        self.assertTrue(len(data["process_status"]) > 0)

    def test_direct_ml_predictions(self):
        payload = {
            "temperature": 425.2,
            "pressure": 1.05,
            "humidity": 37.8,
            "vibration": 0.45,
            "particles": 14.0,
            "voltage": 13.9,
            "current": 47.8,
            "yield": 94.2
        }
        
        # Test predict-fault
        response = self.client.post("/predict-fault", json=payload)
        self.assertEqual(response.status_code, 200)
        res_data = response.json()
        self.assertIn("anomaly_score", res_data)
        self.assertIn("risk_level", res_data)
        self.assertIn("fault_type", res_data)
        
        # Test predict-yield
        response = self.client.post("/predict-yield", json=payload)
        self.assertEqual(response.status_code, 200)
        res_data = response.json()
        self.assertIn("predicted_yield", res_data)
        self.assertIn("yield_loss_probability", res_data)

        # Test predict-rul
        response = self.client.post("/predict-rul", json=payload)
        self.assertEqual(response.status_code, 200)
        res_data = response.json()
        self.assertIn("remaining_useful_life", res_data)
        self.assertIn("failure_probability", res_data)

    def test_csv_upload_handling(self):
        # Construct mock AI4I CSV in-memory
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow([
            "UDI", "Product ID", "Type", "Air temperature [K]", "Process temperature [K]",
            "Rotational speed [rpm]", "Torque [Nm]", "Tool wear [min]", "Machine failure",
            "TWF", "HDF", "PWF", "OSF", "RNF",
        ])
        writer.writerow(["1", "M14860", "M", "298.1", "308.6", "1551", "42.8", "0", "0", "0", "0", "0", "0", "0"])
        writer.writerow(["2", "H99999", "H", "299.5", "314.0", "1200", "55.0", "250", "1", "1", "1", "0", "0", "0"])
        
        csv_data = csv_buffer.getvalue().encode('utf-8')
        
        response = self.client.post(
            "/upload-data",
            files={"file": ("test_telemetry.csv", csv_data, "text/csv")}
        )
        self.assertEqual(response.status_code, 200)
        res_data = response.json()
        self.assertEqual(res_data["records_inserted"], 2)
        self.assertTrue(res_data["anomalies_detected"] >= 1)

    def test_export_pdf_report(self):
        response = self.client.get("/export-pdf")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "application/pdf")
        # Check size is non-empty
        self.assertTrue(len(response.content) > 1000)

if __name__ == "__main__":
    unittest.main()
