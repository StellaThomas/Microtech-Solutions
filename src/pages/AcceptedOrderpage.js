// src/pages/AcceptedOrdersPage.jsx
import { useEffect, useState, useRef } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Snackbar,
  Alert,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Tooltip,
} from "@mui/material";

import RefreshIcon from "@mui/icons-material/Refresh";
import DashboardIcon from "@mui/icons-material/Dashboard";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DownloadIcon from "@mui/icons-material/Download";

import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

export default function AcceptedOrdersPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [orders, setOrders] = useState([]); // raw normalized orders from server
  const [todayOrders, setTodayOrders] = useState([]);
  const [yesterdayOrders, setYesterdayOrders] = useState([]);
  const [olderOrders, setOlderOrders] = useState({});

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // route filter uses routeInfo.RouteName (option B)
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState("");

  const [snack, setSnack] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const abortRef = useRef(null);

  // API base
  const BASE_URL = "http://122.169.40.118:8002/api";

  // -------------------------
  // Helpers
  // -------------------------
  const cleanPrice = (value) => {
    if (value === null || value === undefined) return "0.00";
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toFixed(2);
  };

  const normalizeCreatedAt = (raw) => {
    if (!raw) return new Date().toISOString();
    const candidates = [
      raw.createdAt,
      raw.CreatedAt,
      raw.created_at,
      raw.orderDate,
      raw.date,
      raw.Created_Date,
      raw.raw?.createdAt,
      raw.raw?.CreatedAt,
      raw.raw?.orderDate,
      raw.raw?.date,
    ].filter(Boolean);

    for (const c of candidates) {
      // numeric timestamps (seconds or ms)
      if (typeof c === "number") {
        const ms = c < 1e12 ? c * 1000 : c;
        const dt = new Date(ms);
        if (!Number.isNaN(dt.getTime())) return dt.toISOString();
      }
      // string numeric
      if (typeof c === "string") {
        const trimmed = c.trim();
        const maybeNum = Number(trimmed);
        if (!Number.isNaN(maybeNum) && trimmed.length <= 13) {
          const ms = maybeNum < 1e12 ? maybeNum * 1000 : maybeNum;
          const dt2 = new Date(ms);
          if (!Number.isNaN(dt2.getTime())) return dt2.toISOString();
        }
      }
      const dt = new Date(c);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }

    // fallback
    return new Date().toISOString();
  };

  const toIST = (isoOrDate) => {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return null;
    const ist = new Date(d.getTime() + 19800000);
    return ist;
  };

  const toISTDateString = (iso) => {
    const ist = toIST(iso);
    if (!ist) return null;
    return ist.toISOString().split("T")[0]; // YYYY-MM-DD
  };

  const toISTTimeString = (iso) => {
    const ist = toIST(iso);
    if (!ist) return null;
    return ist.toTimeString().split(" ")[0]; // HH:MM:SS
  };

  const formatDateLabel = (isoString) => {
    if (!isoString) return "";
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // -------------------------
  // Fetch accepted orders from API
  // -------------------------
  const fetchAccepted = async () => {
    setLoading(true);
    setSnack({ open: false, message: "", severity: "success" });
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${BASE_URL}/orders/Status/Accepted`, {
        signal: abortRef.current.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Network ${res.status} ${res.statusText} ${txt}`);
      }
      const payload = await res.json();
      if (!payload || !payload.success) {
        throw new Error(payload?.message || "Failed to load accepted orders");
      }

      const list = Array.isArray(payload.data) ? payload.data : [];

      // normalize each order to expected shape for UI
      const normalized = list.map((o) => {
        const createdIso = normalizeCreatedAt(o);
        return {
          _id: o._id,
          OrderId: o._id,
          agentCode: o.agentCode ?? o.AgentCode ?? o.raw?.agentCode ?? null,
          route:
            typeof o.route !== "undefined"
              ? o.route
              : o.route ?? "",
          routeInfo: o.routeInfo ?? {},
          itemInfo: Array.isArray(o.itemInfo)
            ? o.itemInfo
            : Array.isArray(o.items)
            ? o.items
            : [],
          AgentName:
            (o.agentDetails &&
              (o.agentDetails.AgentNameEng || o.agentDetails.AgentName)) ||
            o.agentName ||
            "Unknown",
          TotalOrder:
            typeof o.TotalOrder !== "undefined"
              ? o.TotalOrder
              : o.totalPrice ?? 0,
          status: (o.status ?? "Accepted").toLowerCase(),
          CreatedAt: o.createdAt ?? o.CreatedAt ?? createdIso,
          raw: o,
        };
      });

      // build route list based on routeInfo.RouteName (option B)
      const uniq = {};
      normalized.forEach((n) => {
        const rn = (n.routeInfo && n.routeInfo.RouteName) || "(No route)";
        const rc = n.route || "";
        const key = rc ? `${rn}||${rc}` : rn;
        if (!uniq[key]) uniq[key] = { name: rn, code: rc, key: key };
      });
      const routeList = Object.values(uniq).sort((a, b) =>
        a.name > b.name ? 1 : -1
      );

      setRoutes(routeList);
      setOrders(normalized);
      setSnack({
        open: true,
        message: `Loaded ${normalized.length} accepted order(s)`,
        severity: "success",
      });
    } catch (err) {
      if (err.name === "AbortError") {
        // ignore
      } else {
        console.error("fetchAccepted error:", err);
        setSnack({
          open: true,
          message: "Failed to fetch accepted orders: " + err.message,
          severity: "error",
        });
        setOrders([]);
        setRoutes([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccepted();
    // eslint-disable-next-line
  }, []);

  // -------------------------
  // Grouping + filtering logic (today / yesterday / older)
  // -------------------------
  useEffect(() => {
    if (!orders.length) {
      setTodayOrders([]);
      setYesterdayOrders([]);
      setOlderOrders({});
      return;
    }

    // apply route filter using routeInfo.RouteName and root route field
    let filtered = [...orders];
    if (selectedRoute) {
      filtered = filtered.filter((o) => {
        const rn = o.routeInfo?.RouteName || "(No route)";
        const rc = o.route || "";
        const key = rc ? `${rn}||${rc}` : rn;
        return key === selectedRoute;
      });
    }

    // apply date range if both provided (fromDate/toDate in YYYY-MM-DD)
    if (fromDate && toDate) {
      filtered = filtered.filter((o) => {
        const ds = toISTDateString(o.CreatedAt);
        return ds && ds >= fromDate && ds <= toDate;
      });
    }

    const now = new Date();
    const istNow = new Date(now.getTime() + 19800000);
    const todayStr = istNow.toISOString().substring(0, 10);
    const y = new Date(istNow);
    y.setDate(y.getDate() - 1);
    const yesterdayStr = y.toISOString().substring(0, 10);

    const t = [];
    const yList = [];
    const older = {};

    filtered.forEach((order) => {
      const dtIso = toISTDateString(order.CreatedAt);
      if (dtIso === todayStr) {
        t.push(order);
      } else if (dtIso === yesterdayStr) {
        yList.push(order);
      } else {
        const label = formatDateLabel(order.CreatedAt);
        if (!older[label]) older[label] = [];
        older[label].push(order);
      }
    });

    // sort groups newest -> oldest
    const sortDesc = (arr) =>
      arr.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
    sortDesc(t);
    sortDesc(yList);
    Object.keys(older).forEach((k) => sortDesc(older[k]));

    // sort older groups by date desc
    const sortedOlder = {};
    Object.keys(older)
      .sort((a, b) => {
        const da = new Date(older[a][0]?.CreatedAt);
        const db = new Date(older[b][0]?.CreatedAt);
        return db - da;
      })
      .forEach((k) => (sortedOlder[k] = older[k]));

    setTodayOrders(t);
    setYesterdayOrders(yList);
    setOlderOrders(sortedOlder);
  }, [orders, selectedRoute, fromDate, toDate]);

  // -------------------------
  // CSV builder - one row per item
  // Columns: agentCode, routeCode (order.route), itemCode, quantities, orderDate (IST YYYY-MM-DD), orderTime (IST hh:mm:ss)
  // -------------------------
  const buildCSVForOrders = (visibleOrders) => {
    if (!visibleOrders || visibleOrders.length === 0) return null;

    const headers = [
      "agentCode",
      "routeCode",
      "itemCode",
      "quantities",
      "orderDate",
      "orderTime",
    ];
    const rows = [];

    visibleOrders.forEach((o) => {
      const items = Array.isArray(o.itemInfo) ? o.itemInfo : [];
      const orderDateStr = toISTDateString(o.CreatedAt) || "";
      const orderTimeStr = toISTTimeString(o.CreatedAt) || "";

      // if no items, push a single row with N/A
      if (!items.length) {
        rows.push({
          agentCode: o.agentCode ?? "",
          routeCode: typeof o.route !== "undefined" ? o.route : "",
          itemCode: "N/A",
          quantities: 0,
          orderDate: orderDateStr,
          orderTime: orderTimeStr,
        });
      } else {
        items.forEach((it) => {
          rows.push({
            agentCode: o.agentCode ?? "",
            routeCode: typeof o.route !== "undefined" ? o.route : "",
            itemCode:
              it.itemCode ??
              it.ItemCode ??
              it.code ??
              String(it.name ?? "UNKNOWN"),
            quantities: it.quantity ?? it.qty ?? 0,
            orderDate: orderDateStr,
            orderTime: orderTimeStr,
          });
        });
      }
    });

    // build CSV string with BOM
    const headerLine = headers.join(",") + "\n";
    const body = rows
      .map((r) =>
        headers
          .map((h) => {
            const v = r[h] ?? "";
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");

    return "\uFEFF" + headerLine + body;
  };

  const createCSVForSelectedRoute = () => {
    // gather visible orders (already filtered by route and date)
    const visible = [...todayOrders, ...yesterdayOrders];
    Object.keys(olderOrders).forEach((k) => visible.push(...olderOrders[k]));

    if (!visible.length) {
      setSnack({
        open: true,
        message: "No orders to export for selected filter",
        severity: "warning",
      });
      return;
    }

    const csv = buildCSVForOrders(visible);
    if (!csv) {
      setSnack({
        open: true,
        message: "Nothing to export",
        severity: "warning",
      });
      return;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const route = routes.find((r) => r.key === selectedRoute);
    const routeDisplay = route ? `${route.name.replace(/\s+/g, "_")}_${route.code}` : "selected";
    const safeName = `accepted_${routeDisplay}_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setSnack({
      open: true,
      message: `CSV created (${visible.length} order rows transformed to item-rows)`,
      severity: "success",
    });
  };

  // -------------------------
  // Section renderer
  // -------------------------
  const renderSection = (title, list) => (
    <>
      <TableRow sx={{ background: "#073763" }}>
        <TableCell colSpan={9} sx={{ fontWeight: "bold", color: "white" }}>
          {title}
        </TableCell>
      </TableRow>

      {list.length === 0 ? (
        <TableRow>
          <TableCell colSpan={9} sx={{ textAlign: "center" }}>
            No Accepted Orders
          </TableCell>
        </TableRow>
      ) : (
        list.map((o, i) => (
          <TableRow
            hover
            key={o.OrderId || `${o.agentCode}-${i}-${title}`}
            sx={{ cursor: "pointer" }}
            onClick={() =>
              navigate(`/orders?orderId=${o.OrderId}&agentCode=${o.agentCode}`)
            }
          >
            <TableCell sx={{ width: 40 }}>{i + 1}</TableCell>
            <TableCell sx={{ width: 120 }}>{o.agentCode}</TableCell>
            <TableCell
              sx={{
                minWidth: 180,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {o.AgentName}
            </TableCell>
            <TableCell sx={{ whiteSpace: "nowrap", width: 100 }}>
              {o.route}
            </TableCell>
            <TableCell sx={{ width: 140 }}>
              {o.routeInfo?.RouteName ?? "(No route)"}
            </TableCell>

            <TableCell sx={{ whiteSpace: "nowrap", width: 120 }}>
              {o.routeInfo?.VehicleNo ?? "-"}
            </TableCell>

            <TableCell sx={{ width: 150 }}>
              {cleanPrice(o.TotalOrder)}
            </TableCell>

            <TableCell sx={{ width: 200 }}>
              {o.CreatedAt
                ? new Date(o.CreatedAt).toLocaleString("en-IN")
                : "-"}
            </TableCell>

            <TableCell sx={{ width: 120 }}>
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  bgcolor: "#4CAF5033",
                  color: "#2e7d32",
                  borderRadius: "10px",
                  textAlign: "center",
                  fontWeight: "bold",
                }}
              >
                स्वीकारले
              </Box>
            </TableCell>
          </TableRow>
        ))
      )}
    </>
  );

  // -------------------------
  // UI
  // -------------------------
  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: 260,
          "& .MuiDrawer-paper": {
            width: 260,
            background: "linear-gradient(180deg,#073763,#021e3a)",
            color: "white",
          },
        }}
      >
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h6">Admin Panel</Typography>
        </Box>

        <Divider sx={{ background: "rgba(255,255,255,0.2)" }} />

        <List>
          <ListItem disablePadding>
            <ListItemButton onClick={() => navigate("/dashboard")}>
              <ListItemIcon sx={{ color: "white" }}>
                <DashboardIcon />
              </ListItemIcon>
              <ListItemText primary="Dashboard" />
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding>
            <ListItemButton onClick={() => navigate("/accepted-orders")}>
              <ListItemIcon sx={{ color: "white" }}>
                <CheckCircleIcon />
              </ListItemIcon>
              <ListItemText primary="Accepted Orders" />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>

      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        <AppBar
          position="sticky"
          sx={{ background: "white", color: "#073763" }}
        >
          <Toolbar sx={{ py: 2.5, px: 3 }}>
            <Box component="img" src={logo} sx={{ height: 60, mr: 3 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                श्री हनुमान सहकारी दूध संस्था, यळगुड.
              </Typography>
              <Typography variant="body2">
                Tal: Hatkangale, Dist. Kolhapur (Maharashtra)
              </Typography>
            </Box>

            <Tooltip title="Refresh">
              <IconButton onClick={fetchAccepted}>
                <RefreshIcon sx={{ color: "#073763", fontSize: 28 }} />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        <Container sx={{ py: 4 }}>
          <Paper elevation={6} sx={{ p: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 3,
                alignItems: "center",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: "bold",
                  color: "#073763",
                  borderLeft: "6px solid #073763",
                  pl: 1.5,
                }}
              >
                Accepted Orders
              </Typography>

              <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                <FormControl size="small" sx={{ minWidth: 300 }}>
                  <InputLabel id="route-filter-label" shrink>
                    Filter by Route
                  </InputLabel>
                  <Select
                    labelId="route-filter-label"
                    label="Filter by Route"
                    value={selectedRoute}
                    onChange={(e) => setSelectedRoute(e.target.value)}
                    displayEmpty
                    renderValue={(selected) => {
                      if (!selected) {
                        return (
                          <span style={{ color: "#999" }}>All Routes</span>
                        );
                      }
                      const route = routes.find((r) => r.key === selected);
                      return route
                        ? `${route.name} (${route.code})`
                        : selected;
                    }}
                  >
                    <MenuItem value="">
                      <em>All Routes</em>
                    </MenuItem>

                    {routes.map((r) => (
                      <MenuItem key={r.key} value={r.key}>
                        {r.name} ({r.code})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  label="From Date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />

                <TextField
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  label="To Date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />

                {/* Create CSV button — show only when a route filter is applied and there are visible orders */}
                {selectedRoute &&
                  todayOrders.length +
                    yesterdayOrders.length +
                    Object.values(olderOrders).reduce(
                      (s, a) => s + a.length,
                      0
                    ) >
                    0 && (
                    <Button
                      variant="contained"
                      startIcon={<DownloadIcon />}
                      onClick={createCSVForSelectedRoute}
                      sx={{
                        background: "linear-gradient(90deg,#28a745,#1e7e34)",
                        color: "#fff",
                        borderRadius: 2,
                      }}
                    >
                      Create CSV
                    </Button>
                  )}
              </Box>
            </Box>

            {loading ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer
                sx={{ border: "1px solid #ddd", borderRadius: 2 }}
              >
                <Table>
                  <TableHead sx={{ background: "#f0f4f9" }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: "bold", width: 40 }}>
                        अ. क्रं
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        एजंट कोड
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        एजंट नाव
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>रूट कोड</TableCell>

                      <TableCell sx={{ fontWeight: "bold" }}>रूट नाव</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        वाहन क्रमांक
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        एकूण ऑर्डर (₹)
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>तारीख</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>स्थिती</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {renderSection("Today", todayOrders)}
                    {renderSection("Yesterday", yesterdayOrders)}
                    {Object.keys(olderOrders).map((date) =>
                      renderSection(date, olderOrders[date])
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Container>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
      >
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
