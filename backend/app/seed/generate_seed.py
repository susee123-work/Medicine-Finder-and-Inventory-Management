import os
import math
import random
import uuid
from datetime import datetime, timedelta, timezone, date
from typing import Dict, Any, List
from backend.app.db.client import db, rows
from backend.app.dw.etl import etl_pipeline
from backend.app.ml.mining import mining_engine
from backend.app.core.auth import hash_password
import logging

logger = logging.getLogger("medipulse.seed")

CITIES_DATA = [
    {"city": "Chennai", "district": "Chennai", "locality": "T. Nagar", "lat": 13.0418, "lng": 80.2341},
    {"city": "Chennai", "district": "Chennai", "locality": "Adyar", "lat": 13.0012, "lng": 80.2565},
    {"city": "Chennai", "district": "Chennai", "locality": "Anna Nagar", "lat": 13.0850, "lng": 80.2101},
    {"city": "Chennai", "district": "Chennai", "locality": "Mylapore", "lat": 13.0368, "lng": 80.2676},
    {"city": "Chennai", "district": "Chennai", "locality": "Velachery", "lat": 12.9815, "lng": 80.2180},
    {"city": "Chennai", "district": "Chennai", "locality": "Tambaram", "lat": 12.9249, "lng": 80.1000},
    {"city": "Coimbatore", "district": "Coimbatore", "locality": "RS Puram", "lat": 11.0089, "lng": 76.9525},
    {"city": "Coimbatore", "district": "Coimbatore", "locality": "Gandhipuram", "lat": 11.0183, "lng": 76.9686},
    {"city": "Coimbatore", "district": "Coimbatore", "locality": "Peelamedu", "lat": 11.0264, "lng": 77.0125},
    {"city": "Coimbatore", "district": "Coimbatore", "locality": "Saibaba Colony", "lat": 11.0312, "lng": 76.9450},
    {"city": "Madurai", "district": "Madurai", "locality": "KK Nagar", "lat": 9.9280, "lng": 78.1460},
    {"city": "Madurai", "district": "Madurai", "locality": "Simmakkal", "lat": 9.9250, "lng": 78.1200},
    {"city": "Madurai", "district": "Madurai", "locality": "Anna Nagar", "lat": 9.9190, "lng": 78.1500},
    {"city": "Tiruchirappalli", "district": "Tiruchirappalli", "locality": "Thillai Nagar", "lat": 10.8250, "lng": 78.6850},
    {"city": "Tiruchirappalli", "district": "Tiruchirappalli", "locality": "Cantonment", "lat": 10.8050, "lng": 78.6800},
    {"city": "Salem", "district": "Salem", "locality": "Fairlands", "lat": 11.6700, "lng": 78.1400},
    {"city": "Salem", "district": "Salem", "locality": "Suramangalam", "lat": 11.6850, "lng": 78.1200},
    {"city": "Tirunelveli", "district": "Tirunelveli", "locality": "Palayamkottai", "lat": 8.7180, "lng": 77.7400},
    {"city": "Vellore", "district": "Vellore", "locality": "Katpadi", "lat": 12.9700, "lng": 79.1400},
    {"city": "Erode", "district": "Erode", "locality": "Perundurai Road", "lat": 11.3400, "lng": 77.7200}
]

PHARMACY_NAMES = [
    "Apollo Pharmacy Main Branch", "MedPlus Health Shoppe", "Wellness Forever Chemists",
    "Netmeds Healthcare Store", "Tulasi Community Pharmacy", "Devi Medicals & Healthcare",
    "Sri Krishna Pharmacy", "City Care Chemists", "LifeLine Drugs & Surgical",
    "Kavitha Medical Hall", "Shree Balaji Pharmacy", "Metro Health Pharmacy",
    "Global Care Pharmacy", "Santhosh Medical Stores", "Prime Health Pharmacy",
    "Relief Drug Centre", "Apex Care Chemist", "Surya Community Medicals",
    "Evergreen Pharmacy", "Guardian Healthcare Store"
]

SUPPLIERS_DATA = [
    {"name": "MedSource National Logistics", "lead_time": 2, "reliability": 98.0, "contact": "Rajesh Sharma", "phone": "+91-9840112233"},
    {"name": "Apex Pharma Distributors", "lead_time": 3, "reliability": 94.5, "contact": "Suresh Patel", "phone": "+91-9840223344"},
    {"name": "SunHealth Wholesale Drugs", "lead_time": 4, "reliability": 91.0, "contact": "Priya Raman", "phone": "+91-9840334455"},
    {"name": "Southern State Medical Depot", "lead_time": 3, "reliability": 88.0, "contact": "Karthik Subramanian", "phone": "+91-9840445566"},
    {"name": "Global Biocare Supply Chain", "lead_time": 5, "reliability": 96.0, "contact": "Anand Varma", "phone": "+91-9840556677"},
    {"name": "MediCare Direct Logistics", "lead_time": 2, "reliability": 95.0, "contact": "Meera Natarajan", "phone": "+91-9840667788"},
    {"name": "Everest Pharmaceuticals", "lead_time": 6, "reliability": 79.5, "contact": "Gopal Krishnan", "phone": "+91-9840778899"},
    {"name": "Zenith Medical Traders", "lead_time": 3, "reliability": 85.0, "contact": "Divya Murugan", "phone": "+91-9840889900"}
]

MEDICINES_CATALOGUE = [
    # Antibiotics / Anti-infectives (ATC J)
    {"name": "Amoxicillin 500mg", "generic": "Amoxicillin", "atc": "J01CA04", "cat": "Antibiotics", "cluster": 0, "price": 85.0},
    {"name": "Azithromycin 500mg", "generic": "Azithromycin", "atc": "J01FA10", "cat": "Antibiotics", "cluster": 0, "price": 125.0},
    {"name": "Cefixime 200mg", "generic": "Cefixime", "atc": "J01DD08", "cat": "Antibiotics", "cluster": 0, "price": 110.0},
    {"name": "Ciprofloxacin 500mg", "generic": "Ciprofloxacin", "atc": "J01MA02", "cat": "Antibiotics", "cluster": 0, "price": 65.0},
    {"name": "Doxycycline 100mg", "generic": "Doxycycline", "atc": "J01AA02", "cat": "Antibiotics", "cluster": 0, "price": 45.0},
    {"name": "Amoxicillin + Clavulanic Acid 625mg", "generic": "Amoxicillin + Clavulanate", "atc": "J01CR02", "cat": "Antibiotics", "cluster": 0, "price": 195.0},
    {"name": "Levofloxacin 500mg", "generic": "Levofloxacin", "atc": "J01MA12", "cat": "Antibiotics", "cluster": 0, "price": 95.0},
    {"name": "Metronidazole 400mg", "generic": "Metronidazole", "atc": "J01XD01", "cat": "Antibiotics", "cluster": 0, "price": 32.0},

    # Antidiabetics (ATC A)
    {"name": "Metformin 500mg", "generic": "Metformin", "atc": "A10BA02", "cat": "Antidiabetics", "cluster": 1, "price": 40.0},
    {"name": "Glimepiride 2mg", "generic": "Glimepiride", "atc": "A10BB12", "cat": "Antidiabetics", "cluster": 1, "price": 75.0},
    {"name": "Sitagliptin 100mg", "generic": "Sitagliptin", "atc": "A10BH01", "cat": "Antidiabetics", "cluster": 1, "price": 240.0},
    {"name": "Dapagliflozin 10mg", "generic": "Dapagliflozin", "atc": "A10BK01", "cat": "Antidiabetics", "cluster": 1, "price": 280.0},
    {"name": "Insulin Glargine 100IU/ml", "generic": "Insulin Glargine", "atc": "A10AE04", "cat": "Antidiabetics", "cluster": 1, "price": 650.0},
    {"name": "Vildagliptin 50mg", "generic": "Vildagliptin", "atc": "A10BH02", "cat": "Antidiabetics", "cluster": 1, "price": 190.0},
    {"name": "Teneligliptin 20mg", "generic": "Teneligliptin", "atc": "A10BH06", "cat": "Antidiabetics", "cluster": 1, "price": 135.0},

    # Cardiovascular & Antihypertensive (ATC C)
    {"name": "Telmisartan 40mg", "generic": "Telmisartan", "atc": "C09CA07", "cat": "Cardiovascular", "cluster": 2, "price": 88.0},
    {"name": "Amlodipine 5mg", "generic": "Amlodipine", "atc": "C08CA01", "cat": "Cardiovascular", "cluster": 2, "price": 42.0},
    {"name": "Atorvastatin 20mg", "generic": "Atorvastatin", "atc": "C10AA05", "cat": "Cardiovascular", "cluster": 2, "price": 160.0},
    {"name": "Losartan 50mg", "generic": "Losartan", "atc": "C09CA01", "cat": "Cardiovascular", "cluster": 2, "price": 65.0},
    {"name": "Clopidogrel 75mg", "generic": "Clopidogrel", "atc": "B01AC04", "cat": "Cardiovascular", "cluster": 2, "price": 95.0},
    {"name": "Metoprolol Succinate 50mg", "generic": "Metoprolol", "atc": "C07AB02", "cat": "Cardiovascular", "cluster": 2, "price": 110.0},
    {"name": "Rosuvastatin 10mg", "generic": "Rosuvastatin", "atc": "C10AA07", "cat": "Cardiovascular", "cluster": 2, "price": 175.0},
    {"name": "Enalapril 5mg", "generic": "Enalapril", "atc": "C09AA02", "cat": "Cardiovascular", "cluster": 2, "price": 38.0},

    # Gastrointestinal (ATC A)
    {"name": "Pantoprazole 40mg", "generic": "Pantoprazole", "atc": "A02BC02", "cat": "Gastrointestinal", "cluster": 3, "price": 78.0},
    {"name": "Omeprazole 20mg", "generic": "Omeprazole", "atc": "A02BC01", "cat": "Gastrointestinal", "cluster": 3, "price": 52.0},
    {"name": "Rabeprazole 20mg", "generic": "Rabeprazole", "atc": "A02BC04", "cat": "Gastrointestinal", "cluster": 3, "price": 92.0},
    {"name": "Ondansetron 4mg", "generic": "Ondansetron", "atc": "A04AA01", "cat": "Gastrointestinal", "cluster": 3, "price": 48.0},
    {"name": "Domperidone 10mg", "generic": "Domperidone", "atc": "A03FA03", "cat": "Gastrointestinal", "cluster": 3, "price": 36.0},
    {"name": "Sucralfate Suspension", "generic": "Sucralfate", "atc": "A02BX02", "cat": "Gastrointestinal", "cluster": 3, "price": 140.0},

    # Respiratory & Antiallergic (ATC R)
    {"name": "Montelukast + Levocetirizine", "generic": "Montelukast + Levocetirizine", "atc": "R03DC03", "cat": "Respiratory", "cluster": 4, "price": 150.0},
    {"name": "Levocetirizine 5mg", "generic": "Levocetirizine", "atc": "R06AE09", "cat": "Respiratory", "cluster": 4, "price": 45.0},
    {"name": "Cetirizine 10mg", "generic": "Cetirizine", "atc": "R06AE07", "cat": "Respiratory", "cluster": 4, "price": 30.0},
    {"name": "Salbutamol Inhaler 100mcg", "generic": "Salbutamol", "atc": "R03AC02", "cat": "Respiratory", "cluster": 4, "price": 180.0},
    {"name": "Budesonide Inhaler 200mcg", "generic": "Budesonide", "atc": "R03BA02", "cat": "Respiratory", "cluster": 4, "price": 320.0},
    {"name": "Acebrophylline 100mg", "generic": "Acebrophylline", "atc": "R03DA14", "cat": "Respiratory", "cluster": 4, "price": 165.0},

    # Analgesics & Anti-inflammatory (ATC N & M)
    {"name": "Paracetamol 650mg", "generic": "Paracetamol", "atc": "N02BE01", "cat": "Analgesics", "cluster": 5, "price": 30.0},
    {"name": "Ibuprofen 400mg", "generic": "Ibuprofen", "atc": "M01AE01", "cat": "Analgesics", "cluster": 5, "price": 35.0},
    {"name": "Aceclofenac + Paracetamol", "generic": "Aceclofenac + Paracetamol", "atc": "M01BC", "cat": "Analgesics", "cluster": 5, "price": 85.0},
    {"name": "Tramadol 50mg", "generic": "Tramadol", "atc": "N02AX02", "cat": "Analgesics", "cluster": 5, "price": 95.0},
    {"name": "Diclofenac Gel 30g", "generic": "Diclofenac", "atc": "M02AA15", "cat": "Analgesics", "cluster": 5, "price": 75.0},
    {"name": "Pregabalin 75mg", "generic": "Pregabalin", "atc": "N02BF02", "cat": "Analgesics", "cluster": 5, "price": 140.0},

    # Vitamins & Supplements (ATC A)
    {"name": "Vitamin D3 60000 IU", "generic": "Cholecalciferol", "atc": "A11CC05", "cat": "Vitamins", "cluster": 6, "price": 110.0},
    {"name": "Calcium Carbonate + Vit D3", "generic": "Calcium + Vitamin D3", "atc": "A12AX", "cat": "Vitamins", "cluster": 6, "price": 95.0},
    {"name": "Methylcobalamin 1500mcg", "generic": "Methylcobalamin", "atc": "B03BA05", "cat": "Vitamins", "cluster": 6, "price": 130.0},
    {"name": "Vitamin C 500mg Chewable", "generic": "Ascorbic Acid", "atc": "A11GA01", "cat": "Vitamins", "cluster": 6, "price": 40.0},
    {"name": "Zincovit Tablets", "generic": "Multivitamin + Zinc", "atc": "A11JB", "cat": "Vitamins", "cluster": 6, "price": 105.0},

    # Dermatology & Ophthalmology
    {"name": "Clotrimazole Cream 15g", "generic": "Clotrimazole", "atc": "D01AC01", "cat": "Dermatology", "cluster": 7, "price": 60.0},
    {"name": "Ciprofloxacin Eye Drops 5ml", "generic": "Ciprofloxacin", "atc": "S01AE03", "cat": "Ophthalmology", "cluster": 7, "price": 45.0},
    {"name": "Carboxymethylcellulose 0.5% Drops", "generic": "Carboxymethylcellulose", "atc": "S01XA20", "cat": "Ophthalmology", "cluster": 7, "price": 120.0},
    {"name": "Betamethasone Cream 20g", "generic": "Betamethasone", "atc": "D07AC01", "cat": "Dermatology", "cluster": 7, "price": 55.0}
]

def seed_database():
    """Generates 12 months realistic synthetic data for 20 pharmacies and 50 medicines."""
    logger.info("Starting MediPulse AI 12-month synthetic database seed...")
    random.seed(42)

    # 1. Insert Suppliers
    suppliers = []
    for s_data in SUPPLIERS_DATA:
        s_id = str(uuid.uuid4())
        rec = {
            "id": s_id,
            "name": s_data["name"],
            "contact_name": s_data["contact"],
            "phone": s_data["phone"],
            "email": f"orders@{s_data['name'].lower().replace(' ', '')}.com",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "typical_lead_time_days": s_data["lead_time"],
            "reliability_score": s_data["reliability"],
            "is_active": True
        }
        suppliers.append(rec)
    db.table("suppliers").insert(suppliers).execute()

    # 2. Insert Medicines
    medicines = []
    for idx, m_data in enumerate(MEDICINES_CATALOGUE):
        m_id = str(uuid.uuid4())
        supp = random.choice(suppliers)
        rec = {
            "id": m_id,
            "name": m_data["name"],
            "generic_name": m_data["generic"],
            "strength": m_data["name"].split()[-1] if len(m_data["name"].split()) > 1 else "Standard",
            "dosage_form": "Tablet" if "Drops" not in m_data["name"] and "Inhaler" not in m_data["name"] else "Drops/Inhaler",
            "atc_code": m_data["atc"],
            "therapeutic_category": m_data["cat"],
            "cluster_group": m_data["cluster"],
            "supplier_id": supp["id"],
            "default_price": m_data["price"],
            "manufacturer": random.choice(["Sun Pharma", "Cipla Ltd", "Dr. Reddy's", "Torrent Pharma", "Lupin", "Abbott"]),
            "is_active": True
        }
        medicines.append(rec)
    db.table("medicines").insert(medicines).execute()

    # 3. Insert 20 Pharmacies & Users
    pharmacies = []
    users = []
    memberships = []

    for idx, p_name in enumerate(PHARMACY_NAMES):
        p_id = str(uuid.uuid4())
        city_info = CITIES_DATA[idx % len(CITIES_DATA)]
        p_rec = {
            "id": p_id,
            "name": p_name,
            "license_number": f"TN-PHARM-2024-{1000 + idx}",
            "phone": f"+91-98765{10000 + idx}",
            "email": f"store{idx+1}@{p_name.lower().split()[0]}.com",
            "address_line": f"No. {idx * 5 + 12}, Main Road, {city_info['locality']}",
            "locality": city_info["locality"],
            "city": city_info["city"],
            "district": city_info["district"],
            "state": "Tamil Nadu",
            "postal_code": f"6000{10 + idx}",
            "latitude": city_info["lat"] + (random.uniform(-0.015, 0.015)),
            "longitude": city_info["lng"] + (random.uniform(-0.015, 0.015)),
            "open_time": "08:00:00",
            "close_time": "23:00:00",
            "is_24_hours": (idx % 4 == 0),
            "verification_status": "VERIFIED",
            "is_active": True
        }
        pharmacies.append(p_rec)

        # Pharmacy Admin User
        admin_id = str(uuid.uuid4())
        u_admin = {
            "id": admin_id,
            "email": f"admin.pharm{idx+1}@medipulse.ai",
            "full_name": f"Manager {p_name.split()[0]}",
            "role": "pharmacy_admin",
            "phone": p_rec["phone"],
            "is_active": True
        }
        users.append(u_admin)
        memberships.append({"user_id": admin_id, "pharmacy_id": p_id, "role": "pharmacy_admin", "is_primary": True})

    # Health Official User
    off_id = str(uuid.uuid4())
    users.append({
        "id": off_id,
        "email": "director.health@tn.gov.in",
        "full_name": "Dr. Arumugam Director of Public Health",
        "role": "health_official",
        "password_hash": hash_password("Official@123"),
        "is_active": True
    })

    # Seed the 4 Portal Login Accounts (with real hashed passwords)
    primary_pharm_id = pharmacies[0]["id"]
    portal_accounts = [
        ("admin@apollopharm.com", "Dr. Sarah Chen (Admin)", "pharmacy_admin", "Admin@123", primary_pharm_id),
        ("staff@apollopharm.com", "Ravi Kumar (Staff)", "pharmacy_staff", "Staff@123", primary_pharm_id),
        ("health.official@tn.gov.in", "Dr. Arumugam (Director of Health Services)", "health_official", "Official@123", None),
        ("patient@gmail.com", "Ananya Sharma (Patient)", "patient", "Patient@123", None),
    ]
    for p_email, p_full, p_role, p_pass, p_pid in portal_accounts:
        uid = str(uuid.uuid4())
        users.append({
            "id": uid,
            "email": p_email,
            "full_name": p_full,
            "role": p_role,
            "password_hash": hash_password(p_pass),
            "is_active": True
        })
        if p_pid:
            memberships.append({"user_id": uid, "pharmacy_id": p_pid, "role": p_role, "is_primary": True})

    db.table("pharmacies").insert(pharmacies).execute()
    db.table("users").insert(users).execute()
    db.table("pharmacy_members").insert(memberships).execute()

    # 4. Insert Inventory Batches (FEFO Tracking)
    inventory_items = []
    today = date.today()

    for p in pharmacies:
        # Stock 80-95% of medicines in each pharmacy
        stocked_meds = random.sample(medicines, int(len(medicines) * 0.9))
        for m in stocked_meds:
            # 1 to 3 batches per medicine with varying expiry dates
            num_batches = random.choices([1, 2, 3], weights=[0.4, 0.4, 0.2])[0]
            for b_idx in range(num_batches):
                # Some batches intentionally low stock or near expiry to trigger realistic shortage signals
                is_critical = random.random() < 0.12 # 12% at risk
                is_near_expiry = random.random() < 0.08 # 8% expiring soon

                if is_critical:
                    qty = random.randint(0, 8)
                else:
                    qty = random.randint(25, 180)

                if is_near_expiry:
                    exp = today + timedelta(days=random.randint(5, 28))
                else:
                    exp = today + timedelta(days=random.randint(60, 500))

                batch_rec = {
                    "id": str(uuid.uuid4()),
                    "pharmacy_id": p["id"],
                    "medicine_id": m["id"],
                    "batch_no": f"BATCH-{m['name'][:3].upper()}-{random.randint(100, 999)}",
                    "quantity": qty,
                    "expiry_date": exp.isoformat(),
                    "unit_cost": round(m["default_price"] * 0.7, 2),
                    "selling_price": m["default_price"],
                    "supplier_id": m["supplier_id"],
                    "verified_at": (datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 48))).isoformat()
                }
                inventory_items.append(batch_rec)

    db.table("inventory").insert(inventory_items).execute()

    # 5. Generate 12 Months of Sales History with Seasonality & Outbreak Spikes
    logger.info("Generating 12 months of sales transactions...")
    sales_records = []
    baskets = []
    basket_items = []
    
    start_date = today - timedelta(days=365)
    
    # Pre-select high-volume pairings for market basket analysis
    pairing_candidates = [
        ("Amoxicillin", "Paracetamol"),
        ("Azithromycin", "Levocetirizine"),
        ("Metformin", "Glimepiride"),
        ("Pantoprazole", "Domperidone"),
        ("Telmisartan", "Amlodipine"),
        ("Montelukast", "Levocetirizine")
    ]
    med_by_name = {m["name"].split()[0]: m["id"] for m in medicines}

    # Generate sales transactions across past 365 days
    sample_pharmacies = pharmacies[:8] # High density for fast seeding while realistic
    
    for day_offset in range(0, 365, 2): # Every 2 days
        curr_d = start_date + timedelta(days=day_offset)
        d_str = curr_d.isoformat()
        dow = curr_d.weekday() # 5, 6 is weekend
        month = curr_d.month

        # Day of week multiplier (weekends have 35% higher sales)
        dow_mult = 1.35 if dow in (5, 6) else 1.0
        
        # Winter / Monsoon epidemic surge for Respiratory & Antibiotics (Nov, Dec, Jan)
        surge_mult = 1.8 if month in (11, 12, 1) else 1.0

        for p in sample_pharmacies:
            # Daily sales for 6-10 medicines
            daily_meds = random.sample(medicines, random.randint(6, 10))
            for m in daily_meds:
                is_resp = m["therapeutic_category"] in ("Respiratory", "Antibiotics")
                base_qty = random.randint(2, 8)
                qty = int(math.ceil(base_qty * dow_mult * (surge_mult if is_resp else 1.0)))

                s_time = datetime.combine(curr_d, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=random.randint(8, 21), minutes=random.randint(0, 59))
                
                sales_records.append({
                    "id": str(uuid.uuid4()),
                    "pharmacy_id": p["id"],
                    "medicine_id": m["id"],
                    "quantity": qty,
                    "unit_price": m["default_price"],
                    "total_amount": round(qty * m["default_price"], 2),
                    "sold_at": s_time.isoformat(),
                    "status": "COMPLETED"
                })

            # Create Co-Purchased Baskets for Market Basket Analysis (Apriori/FP-Growth)
            if random.random() < 0.6:
                b_id = str(uuid.uuid4())
                baskets.append({
                    "id": b_id,
                    "basket_code": f"BSK-{curr_d.strftime('%Y%m%d')}-{random.randint(1000, 9999)}",
                    "pharmacy_id": p["id"],
                    "sold_at": s_time.isoformat()
                })
                # Add co-purchased pair
                pair = random.choice(pairing_candidates)
                mid_a = med_by_name.get(pair[0], medicines[0]["id"])
                mid_b = med_by_name.get(pair[1], medicines[1]["id"])
                basket_items.append({"id": str(uuid.uuid4()), "basket_id": b_id, "medicine_id": mid_a, "quantity": 1, "unit_price": 50.0})
                basket_items.append({"id": str(uuid.uuid4()), "basket_id": b_id, "medicine_id": mid_b, "quantity": 1, "unit_price": 30.0})

    db.table("sales").insert(sales_records).execute()
    db.table("sale_baskets").insert(baskets).execute()
    db.table("sale_basket_items").insert(basket_items).execute()

    # 6. Generate Deliveries with Lead-Time and Delay Variability
    logger.info("Generating purchase order delivery history...")
    deliveries = []
    for _ in range(120):
        supp = random.choice(suppliers)
        pharm = random.choice(pharmacies)
        med = random.choice(medicines)
        
        ord_d = today - timedelta(days=random.randint(5, 180))
        typ_lead = supp["typical_lead_time_days"]
        exp_d = ord_d + timedelta(days=typ_lead)

        # 25% chance of delay
        is_late = random.random() < 0.25
        delay = random.randint(1, 5) if is_late else 0
        rec_d = exp_d + timedelta(days=delay)
        qty_ord = random.choice([50, 100, 150, 200])
        qty_rec = qty_ord if not is_late else int(qty_ord * random.uniform(0.75, 1.0))

        deliveries.append({
            "id": str(uuid.uuid4()),
            "supplier_id": supp["id"],
            "pharmacy_id": pharm["id"],
            "medicine_id": med["id"],
            "ordered_on": ord_d.isoformat(),
            "expected_on": exp_d.isoformat(),
            "received_on": rec_d.isoformat(),
            "quantity_ordered": qty_ord,
            "quantity_received": qty_rec,
            "status": "DELIVERED",
            "lead_time_days": (rec_d - ord_d).days,
            "delay_days": delay
        })
    db.table("deliveries").insert(deliveries).execute()

    # 7. Execute Initial ETL & Train Data Mining Models
    logger.info("Executing initial incremental ETL for Star & Snowflake schemas...")
    etl_pipeline.run_pipeline()
    mining_engine.train_shortage_classifier()

    logger.info("Database seeding complete: 20 pharmacies, %d medicines, %d batches, %d sales records.",
                len(medicines), len(inventory_items), len(sales_records))

if __name__ == "__main__":
    seed_database()
