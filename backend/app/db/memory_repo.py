import re
import uuid
import copy
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional, Union

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class PostgrestResponse:
    def __init__(self, data: Any):
        self.data = data
        self.count = len(data) if isinstance(data, list) else (1 if data is not None else 0)

class QueryBuilder:
    def __init__(self, table_name: str, repo: 'MemoryRepository'):
        self.table_name = table_name
        self.repo = repo
        self._select_cols: Optional[str] = None
        self._filters: List[Any] = []
        self._order_by: Optional[str] = None
        self._order_desc: bool = False
        self._limit_val: Optional[int] = None
        self._op: str = "select" # select, insert, upsert, update, delete
        self._payload: Any = None
        self._on_conflict: Optional[str] = None

    def select(self, columns: str = "*", count: Optional[str] = None) -> 'QueryBuilder':
        self._op = "select"
        self._select_cols = columns
        return self

    def insert(self, values: Union[Dict[str, Any], List[Dict[str, Any]]]) -> 'QueryBuilder':
        self._op = "insert"
        self._payload = values
        return self

    def upsert(self, values: Union[Dict[str, Any], List[Dict[str, Any]]], on_conflict: Optional[str] = None) -> 'QueryBuilder':
        self._op = "upsert"
        self._payload = values
        self._on_conflict = on_conflict
        return self

    def update(self, values: Dict[str, Any]) -> 'QueryBuilder':
        self._op = "update"
        self._payload = values
        return self

    def delete(self) -> 'QueryBuilder':
        self._op = "delete"
        return self

    def eq(self, column: str, value: Any) -> 'QueryBuilder':
        self._filters.append(lambda row: str(row.get(column)) == str(value) if row.get(column) is not None else value is None)
        return self

    def neq(self, column: str, value: Any) -> 'QueryBuilder':
        self._filters.append(lambda row: str(row.get(column)) != str(value))
        return self

    def gt(self, column: str, value: Any) -> 'QueryBuilder':
        self._filters.append(lambda row: row.get(column) is not None and row.get(column) > value)
        return self

    def gte(self, column: str, value: Any) -> 'QueryBuilder':
        self._filters.append(lambda row: row.get(column) is not None and row.get(column) >= value)
        return self

    def lt(self, column: str, value: Any) -> 'QueryBuilder':
        self._filters.append(lambda row: row.get(column) is not None and row.get(column) < value)
        return self

    def lte(self, column: str, value: Any) -> 'QueryBuilder':
        self._filters.append(lambda row: row.get(column) is not None and row.get(column) <= value)
        return self

    def ilike(self, column: str, pattern: str) -> 'QueryBuilder':
        pat = pattern.replace("%", ".*")
        regex = re.compile(pat, re.IGNORECASE)
        self._filters.append(lambda row: bool(regex.search(str(row.get(column) or ""))))
        return self

    def like(self, column: str, pattern: str) -> 'QueryBuilder':
        pat = pattern.replace("%", ".*")
        regex = re.compile(pat)
        self._filters.append(lambda row: bool(regex.search(str(row.get(column) or ""))))
        return self

    def in_(self, column: str, values: List[Any]) -> 'QueryBuilder':
        val_strs = [str(v) for v in values]
        self._filters.append(lambda row: str(row.get(column)) in val_strs)
        return self

    def order(self, column: str, desc: bool = False) -> 'QueryBuilder':
        self._order_by = column
        self._order_desc = desc
        return self

    def limit(self, count: int) -> 'QueryBuilder':
        self._limit_val = count
        return self

    def execute(self) -> PostgrestResponse:
        table = self.repo.get_table(self.table_name)
        
        if self._op == "insert":
            records = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for item in records:
                row = copy.deepcopy(item)
                if "id" not in row or not row["id"]:
                    row["id"] = str(uuid.uuid4())
                if "created_at" not in row:
                    row["created_at"] = now_iso()
                table.append(row)
                inserted.append(row)
            return PostgrestResponse(inserted)

        elif self._op == "upsert":
            records = self._payload if isinstance(self._payload, list) else [self._payload]
            conflict_cols = [c.strip() for c in (self._on_conflict or "id").split(",")]
            upserted = []
            for item in records:
                row = copy.deepcopy(item)
                match_idx = None
                for idx, existing in enumerate(table):
                    if all(str(existing.get(c)) == str(row.get(c)) for c in conflict_cols if c in row and c in existing):
                        match_idx = idx
                        break
                if match_idx is not None:
                    table[match_idx].update(row)
                    upserted.append(table[match_idx])
                else:
                    if "id" not in row or not row["id"]:
                        row["id"] = str(uuid.uuid4())
                    if "created_at" not in row:
                        row["created_at"] = now_iso()
                    table.append(row)
                    upserted.append(row)
            return PostgrestResponse(upserted)

        elif self._op == "update":
            updated = []
            for row in table:
                if all(f(row) for f in self._filters):
                    row.update(self._payload)
                    row["updated_at"] = now_iso()
                    updated.append(row)
            return PostgrestResponse(updated)

        elif self._op == "delete":
            deleted = []
            kept = []
            for row in table:
                if all(f(row) for f in self._filters):
                    deleted.append(row)
                else:
                    kept.append(row)
            self.repo.set_table(self.table_name, kept)
            return PostgrestResponse(deleted)

        # Default: select
        res = []
        for row in table:
            if all(f(row) for f in self._filters):
                res.append(copy.deepcopy(row))

        # Join resolutions if specified in select
        if self._select_cols and "(" in self._select_cols:
            res = self._resolve_joins(res, self._select_cols)

        if self._order_by:
            def sort_key(x):
                val = x.get(self._order_by)
                if val is None:
                    return "" if not self._order_desc else "\uffff"
                return str(val)
            res.sort(key=sort_key, reverse=self._order_desc)

        if self._limit_val is not None:
            res = res[:self._limit_val]

        return PostgrestResponse(res)

    def _resolve_joins(self, rows: List[Dict[str, Any]], select_cols: str) -> List[Dict[str, Any]]:
        # Handles patterns like: *, medicines(name,strength), suppliers(name,lead_time_days), pharmacies(*)
        for row in rows:
            if "medicines(" in select_cols and "medicine_id" in row:
                med = self.repo.find_one("medicines", id=row["medicine_id"])
                if med:
                    supp = self.repo.find_one("suppliers", id=med.get("supplier_id")) if med.get("supplier_id") else None
                    med_copy = copy.deepcopy(med)
                    med_copy["suppliers"] = supp
                    row["medicines"] = med_copy
            if "pharmacies(" in select_cols and "pharmacy_id" in row:
                pharm = self.repo.find_one("pharmacies", id=row["pharmacy_id"])
                row["pharmacies"] = copy.deepcopy(pharm) if pharm else None
            if "suppliers(" in select_cols and "supplier_id" in row:
                supp = self.repo.find_one("suppliers", id=row["supplier_id"])
                row["suppliers"] = copy.deepcopy(supp) if supp else None
        return rows


class MemoryRepository:
    def __init__(self):
        self.tables: Dict[str, List[Dict[str, Any]]] = {
            "pharmacies": [],
            "users": [],
            "pharmacy_members": [],
            "suppliers": [],
            "medicines": [],
            "inventory": [],
            "sales": [],
            "sale_baskets": [],
            "sale_basket_items": [],
            "deliveries": [],
            "confirmation_requests": [],
            "restock_subscriptions": [],
            "audit_logs": [],
            "model_registry": [],
            "star_dim_date": [],
            "star_dim_time_of_day": [],
            "star_dim_area": [],
            "star_dim_pharmacy": [],
            "star_dim_medicine": [],
            "star_dim_supplier": [],
            "star_fact_daily_sales": [],
            "star_fact_deliveries": [],
            "star_fact_stockouts": [],
            "star_fact_inventory_snapshot": [],
            "snow_dim_state": [],
            "snow_dim_district": [],
            "snow_dim_city": [],
            "snow_dim_locality": [],
            "snow_dim_pharmacy": [],
            "snow_dim_atc_level1": [],
            "snow_dim_atc_level2": [],
            "snow_dim_atc_level3": [],
            "snow_dim_atc_level4": [],
            "snow_dim_medicine": [],
            "snow_dim_year": [],
            "snow_dim_quarter": [],
            "snow_dim_month": [],
            "snow_dim_day": [],
            "etl_runs": [],
            "etl_watermarks": []
        }

    def table(self, table_name: str) -> QueryBuilder:
        return QueryBuilder(table_name, self)

    def get_table(self, table_name: str) -> List[Dict[str, Any]]:
        return self.tables.setdefault(table_name, [])

    def set_table(self, table_name: str, rows: List[Dict[str, Any]]) -> None:
        self.tables[table_name] = rows

    def find_one(self, table_name: str, **kwargs) -> Optional[Dict[str, Any]]:
        for row in self.get_table(table_name):
            if all(str(row.get(k)) == str(v) for k, v in kwargs.items()):
                return row
        return None

    def clear(self):
        for k in self.tables:
            self.tables[k] = []

