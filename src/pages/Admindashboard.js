// src/pages/DashboardPage.jsx
import React, { useEffect, useState, useRef } from "react";
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

import RefreshIcon from "@mui/icons-material/Refresh";
import DashboardIcon from "@mui/icons-material/Dashboard";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import GetAppIcon from "@mui/icons-material/GetApp";
import FilterListIcon from "@mui/icons-material/FilterList";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";

import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

export default function DashboardPage() {
  const navigate = useNavigate();

  // Data & UI state
  const [loading, setLoading] = useState(false);
  const [allOrders, setAllOrders] = useState([]);
  const [todayOrders, setTodayOrders] = useState([]);
  const [yesterdayOrders, setYesterdayOrders] = useState([]);
  const [olderOrders, setOlderOrders] = useState({});

  const [routes, setRoutes] = useState([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [snack, setSnack] = useState({
    open: false,
    message: "",
    severity: "success",
  });
  const [fetchError, setFetchError] = useState(null);

  // Exclusive open section (only one open at a time). default "Today"
  const [openSection, setOpenSection] = useState("Today");

  // keep a processing flag while approving orders
  const [processing, setProcessing] = useState(false);

  // Keep track of pending Today count to detect when new orders arrive.
  const [pendingTodayCount, setPendingTodayCount] = useState(0);
  const prevPendingTodayCountRef = useRef(0);

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState({
    action: "",
    section: "",
    orders: [],
  });

  // API base (change if needed)
  const BASE_URL = "http://122.169.40.118:8002/api";

  // helper: today's IST date string (YYYY-MM-DD)
  const getTodayIST = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + 19800000);
    return ist.toISOString().substring(0, 10);
  };

  const columnWidths = {
    index: 40,
    routeCode: 140,
    routeName: 200,
    vehicleNo: 140,
    agentName: 200,
    agentCode: 120,
    totalOrder: 150,
    status: 160,
  };

  // Normalizes various createdAt fields to a Date object (or null)
  const parseOrderDate = (order) => {
    if (!order) return null;
    const candidates = [
      order.CreatedAt,
      order.createdAt,
      order.orderDate,
      order.raw?.CreatedAt,
      order.raw?.createdAt,
      order.raw?.orderDate,
      order.raw?.order_date,
      order.raw?.date,
    ].filter(Boolean);
    for (const c of candidates) {
      const dt = new Date(c);
      if (!Number.isNaN(dt.getTime())) return dt;
    }
    const ts =
      order.raw && (order.raw.timestamp || order.raw.time || order.raw.ts);
    if (typeof ts === "number" && !Number.isNaN(ts)) {
      const dt = new Date(ts);
      if (!Number.isNaN(dt.getTime())) return dt;
    }
    return null;
  };

  const toISTDateString = (d) => {
    if (!d) return null;
    const utc = new Date(d);
    if (Number.isNaN(utc.getTime())) return null;
    const ist = new Date(utc.getTime() + 19800000);
    return ist.toISOString().substring(0, 10);
  };

  const formatDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const computeTotalFromItems = (itemInfo) => {
    if (!Array.isArray(itemInfo)) return 0;
    return itemInfo.reduce((s, it) => s + Number(it.totalPrice ?? 0), 0);
  };

  // Fetch pending orders once (no auto-refresh)
  const refreshData = async () => {
    setSnack({ open: false, message: "", severity: "success" });
    setFetchError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/orders/Status/Pending`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Network error ${res.status} ${res.statusText} ${txt}`);
      }
      const result = await res.json();
      if (!result || !result.success) {
        const msg = result?.message || "Failed to fetch orders";
        setSnack({ open: true, message: msg, severity: "error" });
        setAllOrders([]);
        setRoutes([]);
        setFetchError(msg);
        setLoading(false);
        return;
      }

      const list = Array.isArray(result.data) ? result.data : [];

      const mapped = list.map((o) => {
        const agent = o.agentDetails ?? o.agent ?? {};
        const route = o.routeInfo ?? o.routeDetails ?? o.route ?? {};
        const total =
          Number(o.TotalOrder ?? o.totalPrice ?? 0) ||
          computeTotalFromItems(o.itemInfo || []);
        const salesRouteCode =
          agent.SalesRouteCode ??
          agent.RouteCode ??
          o.routeCode ??
          o.SalesRouteCode ??
          route.SalesRouteCode ??
          "";
        const routeName =
          route.RouteName ??
          agent.RouteName ??
          o.routeName ??
          o.RouteName ??
          "";
        return {
          OrderId: o._id ?? o.OrderId ?? o.id ?? "",
          AgentCode: agent.AgentCode ?? o.agentCode ?? agent.code ?? null,
          AgentName:
            (agent.AgentNameEng && agent.AgentNameEng.trim()) ||
            (agent.AgentName && agent.AgentName.trim()) ||
            (o.agentDetails?.AgentName ?? o.agentName ?? "Unknown"),
          SalesRouteCode: salesRouteCode,
          RouteName: routeName,
          VehichleNo:
            route.VehicleNo ??
            route.VehichleNo ??
            o.vehicleNo ??
            o.VehicleNo ??
            "",
          TotalOrder: Number(total),
          status: (o.status ?? "pending").toLowerCase(),
          CreatedAt: o.createdAt ?? o.CreatedAt ?? o.orderDate ?? null,
          raw: o,
        };
      });

      setAllOrders(mapped);

      // build unique route options
      const unique = {};
      mapped.forEach((m) => {
        const code = m.SalesRouteCode ?? "";
        const name = m.RouteName ?? "(No name)";
        const key = `${code}||${name}`;
        if (!unique[key]) unique[key] = { key, code, name };
      });
      const routeList = Object.values(unique).sort((a, b) =>
        a.name > b.name ? 1 : -1
      );
      setRoutes(routeList);

      setSnack({ open: true, message: "Data Loaded", severity: "success" });
      setFetchError(null);
    } catch (err) {
      console.error("refreshData error:", err);
      const msg = err?.message || "Unknown fetch error";
      setSnack({
        open: true,
        message: "Error loading data: " + msg,
        severity: "error",
      });
      setAllOrders([]);
      setRoutes([]);
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line
  }, []);

  // grouping logic with route & date filter
  useEffect(() => {
    if (!allOrders.length) {
      setTodayOrders([]);
      setYesterdayOrders([]);
      setOlderOrders({});
      setPendingTodayCount(0);
      return;
    }

    // only show pending orders on dashboard
    let pending = allOrders.filter(
      (o) => (o.status ?? "").toLowerCase() === "pending"
    );

    if (selectedRouteKey) {
      pending = pending.filter((o) => {
        const code = o.SalesRouteCode ?? "";
        const name = o.RouteName ?? "(No name)";
        const key = `${code}||${name}`;
        return key === selectedRouteKey;
      });
    }

    if (fromDate && toDate) {
      pending = pending.filter((o) => {
        const orderDate = toISTDateString(o.CreatedAt);
        return orderDate && orderDate >= fromDate && orderDate <= toDate;
      });
    }

    const now = new Date();
    const istNow = new Date(now.getTime() + 19800000);
    const todayStr = istNow.toISOString().substring(0, 10);

    const y = new Date(istNow);
    y.setDate(y.getDate() - 1);
    const yesterdayStr = y.toISOString().substring(0, 10);

    const todayList = [];
    const yesterdayList = [];
    const olderGrouped = {};

    pending.forEach((order) => {
      const dt =
        parseOrderDate(order) ||
        (order.CreatedAt ? new Date(order.CreatedAt) : null);
      const dateStr =
        dt && !Number.isNaN(dt.getTime())
          ? new Date(dt.getTime() + 19800000).toISOString().substring(0, 10)
          : "";
      if (dateStr === todayStr) {
        todayList.push(order);
      } else if (dateStr === yesterdayStr) {
        yesterdayList.push(order);
      } else {
        const label = formatDate(order.CreatedAt || dt);
        if (!olderGrouped[label]) olderGrouped[label] = [];
        olderGrouped[label].push(order);
      }
    });

    // sort groups descending
    const sortedGroups = {};
    Object.keys(olderGrouped)
      .sort((a, b) => new Date(b) - new Date(a))
      .forEach((k) => (sortedGroups[k] = olderGrouped[k]));

    setTodayOrders(todayList);
    setYesterdayOrders(yesterdayList);
    setOlderOrders(sortedGroups);

    // update pending today count
    const newPendingTodayCount = todayList.length;
    prevPendingTodayCountRef.current = newPendingTodayCount;
    setPendingTodayCount(newPendingTodayCount);
  }, [allOrders, fromDate, toDate, selectedRouteKey]);

  // When user clicks Accept on a section (any section title)
  const onAcceptSection = (sectionTitle, orders) => {
    setConfirmPayload({
      action: "accept",
      section: sectionTitle,
      orders,
    });
    setConfirmOpen(true);
  };

  // helper: convert a sectionTitle ("Today","Yesterday" or "DD/MM/YYYY") into YYYY-MM-DD ISO string
  const sectionTitleToISO = (sectionTitle) => {
    const now = new Date();
    const istNow = new Date(now.getTime() + 19800000);
    const todayStr = istNow.toISOString().substring(0, 10);
    const y = new Date(istNow);
    y.setDate(y.getDate() - 1);
    const yesterdayStr = y.toISOString().substring(0, 10);

    if (sectionTitle === "Today") return todayStr;
    if (sectionTitle === "Yesterday") return yesterdayStr;

    // expect label format "DD/MM/YYYY" (from formatDate)
    const parts = sectionTitle.split("/");
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts;
      if (dd.length && mm.length && yyyy.length) {
        return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
    }
    return null;
  };

  // Confirm result (Accept)
  const doConfirm = async () => {
    const { action, section, orders } = confirmPayload;

    if (action === "accept") {
      const orderIds = (orders || []).map((o) => o.OrderId).filter(Boolean);
      if (orderIds.length === 0) {
        setSnack({
          open: true,
          message: "No orders to accept",
          severity: "warning",
        });
        setConfirmOpen(false);
        return;
      }

      try {
        setProcessing(true);
        console.log("📤 Approving (PUT) orders:", orderIds);

        const res = await fetch(`${BASE_URL}/orders/approve`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ orderIds }),
        });

        let data = {};
        try {
          data = await res.json();
        } catch (err) {
          console.warn("Non-JSON response from approve endpoint", err);
        }

        if (!res.ok || data.success === false) {
          const msg = data?.message || `Server responded with ${res.status}`;
          throw new Error(msg);
        }

        const modified =
          data.modifiedCount ?? data.modified ?? data.nModified ?? 0;
        setSnack({
          open: true,
          message: `✅ ${modified} order(s) accepted successfully`,
          severity: "success",
        });

        // refresh quickly so UI shows changes
        setTimeout(() => {
          window.location.reload();
        }, 900);
      } catch (error) {
        console.error("❌ Error approving orders:", error);
        setSnack({
          open: true,
          message: `❌ Error: ${error.message}`,
          severity: "error",
        });
      } finally {
        setProcessing(false);
      }
    }

    setConfirmOpen(false);
    setConfirmPayload({ action: "", section: "", orders: [] });
  };

  // Section header
  const sectionHeader = (title, list) => {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.25,
          background: "#073763",
          color: "white",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton
            size="small"
            sx={{ color: "white" }}
            onClick={(e) => {
              e.stopPropagation();
              setOpenSection((prev) => (prev === title ? null : title));
            }}
          >
            {openSection === title ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }} />
      </Box>
    );
  };

  // render rows — improved alignment & vertical centering
  const renderRows = (list) =>
    list.map((o, i) => (
      <TableRow
        key={o.OrderId || `${o.AgentCode}-${i}`}
        hover
        sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 } }}
        onClick={() => {
          const statusParam = encodeURIComponent(
            o.raw?.status ?? o.status ?? ""
          );
          navigate(
            `/orders?orderId=${o.OrderId}&agentCode=${o.AgentCode}&status=${statusParam}`
          );
        }}
      >
        <TableCell sx={{ width: columnWidths.index, pl: 2 }}>{i + 1}</TableCell>

        <TableCell sx={{ width: columnWidths.routeCode }}>
          {o.SalesRouteCode}
        </TableCell>

        <TableCell
          sx={{
            width: columnWidths.routeName,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {o.RouteName}
        </TableCell>

        <TableCell sx={{ width: columnWidths.vehicleNo }}>
          {o.VehichleNo}
        </TableCell>

        <TableCell
          sx={{
            width: columnWidths.agentName,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {o.AgentName}
        </TableCell>

        <TableCell sx={{ width: columnWidths.agentCode }}>
          {o.AgentCode}
        </TableCell>

        <TableCell sx={{ width: columnWidths.totalOrder }}>
          ₹{" "}
          {Number(o.TotalOrder).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
          })}
        </TableCell>

        <TableCell sx={{ width: columnWidths.status, textAlign: "center" }}>
          <Box
            sx={{
              px: 1,
              py: 0.4,
              bgcolor: "#fff3cd",
              color: "#c77e00",
              borderRadius: "8px",
              fontWeight: "bold",
              fontSize: 13,
              display: "inline-block",
            }}
          >
            प्रलंबित
          </Box>
        </TableCell>
      </TableRow>
    ));

  // Helper function to check if all orders in a list have the same route code
  const allOrdersSameRoute = (ordersList) => {
    if (!ordersList || ordersList.length === 0) return false;
    const firstRoute = ordersList[0].SalesRouteCode || ordersList[0].RouteName;
    return ordersList.every(
      (order) => (order.SalesRouteCode || order.RouteName) === firstRoute
    );
  };

  // renderSection: show Accept button only for "Today" when all orders have same route code
  const renderSection = (title, list) => {
    // For "Today" section: only show Accept if all orders have same route code
    // For other sections: always show Accept button (original behavior)
    const isTodaySection = title === "Today";
    const allSameRoute = allOrdersSameRoute(list);
    const isAcceptable =
      list && list.length > 0 && (!isTodaySection || allSameRoute);

    return (
      <TableRow>
        <TableCell colSpan={8} sx={{ p: 0 }}>
          <Paper
            elevation={1}
            sx={{ borderRadius: 2, overflow: "hidden", mb: 1 }}
          >
            {sectionHeader(title, list)}
            {openSection === title ? (
              <>
                {list.length === 0 ? (
                  <Box sx={{ py: 3, textAlign: "center" }}>
                    <Typography color="text.secondary">No Orders</Typography>
                  </Box>
                ) : (
                  <Table size="small">
                    <TableBody>{renderRows(list)}</TableBody>
                  </Table>
                )}

                {/* Accept button - show based on conditions */}
                {isAcceptable && (
                  <Box
                    sx={{ display: "flex", justifyContent: "flex-end", p: 2 }}
                  >
                    <Button
                      variant="contained"
                      size="large"
                      disabled={processing}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAcceptSection(title, list);
                      }}
                      sx={{
                        background: "linear-gradient(90deg,#28a745,#1e7e34)",
                        color: "#fff",
                        borderRadius: 6,
                        textTransform: "none",
                        px: 3,
                        boxShadow: "0 10px 24px rgba(46,125,50,0.16)",
                      }}
                    >
                      {processing ? "Processing..." : "Accept Orders"}
                    </Button>
                  </Box>
                )}

                {/* Info message for Today section when routes don't match */}
                {isTodaySection && !allSameRoute && list.length > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      p: 2,
                      background: "#fff3cd",
                      borderTop: "1px solid #ffc107",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ color: "#856404", fontWeight: 500 }}
                    >
                      ⓘ Please filter by route to accept orders with the same
                      route code
                    </Typography>
                  </Box>
                )}
              </>
            ) : null}
          </Paper>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "#f4f7fb" }}>
      {/* Sidebar */}
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

        <Divider sx={{ background: "rgba(255,255,255,0.12)" }} />

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
                <FileDownloadIcon />
              </ListItemIcon>
              <ListItemText primary="Accepted Orders" />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>

      {/* MAIN AREA */}
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        <AppBar
          position="sticky"
          elevation={1}
          sx={{ background: "white", color: "#073763" }}
        >
          <Toolbar sx={{ py: 2.5, px: 3 }}>
            <Box component="img" src={logo} sx={{ height: 54, mr: 3 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: "700" }}>
                श्री हनुमान सहकारी दूध संस्था, यळगुड.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tal: Hatkangale, Dist. Kolhapur (Maharashtra)
              </Typography>
            </Box>

            <Tooltip title="Refresh">
              <IconButton
                onClick={() => refreshData()}
                sx={{ borderRadius: 2 }}
              >
                <RefreshIcon sx={{ color: "#073763", fontSize: 26 }} />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        <Container sx={{ py: 4 }}>
          <Paper elevation={6} sx={{ p: 3, borderRadius: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
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
                Requirements
              </Typography>

              <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                <FormControl size="small" sx={{ minWidth: 260 }}>
                  <InputLabel id="route-filter-label">
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <FilterListIcon sx={{ fontSize: 16 }} /> Filter by Route
                    </Box>
                  </InputLabel>
                  <Select
                    labelId="route-filter-label"
                    label="Filter by Route"
                    value={selectedRouteKey}
                    onChange={(e) => setSelectedRouteKey(e.target.value)}
                    sx={{ minWidth: 260 }}
                  >
                    <MenuItem value="">All Routes</MenuItem>
                    {routes.map((r) => (
                      <MenuItem key={r.key} value={r.key}>
                        {r.name} {r.code ? `(${r.code})` : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  type="date"
                  size="small"
                  label="From Date"
                  InputLabelProps={{ shrink: true }}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <TextField
                  type="date"
                  size="small"
                  label="To Date"
                  InputLabelProps={{ shrink: true }}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </Box>
            </Box>

            {loading ? (
              <Box sx={{ textAlign: "center", py: 6 }}>
                <CircularProgress />
              </Box>
            ) : fetchError ? (
              <Box sx={{ py: 6, textAlign: "center" }}>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  Could not load orders: {fetchError}
                </Typography>
                <Button variant="contained" onClick={() => refreshData()}>
                  Try Again
                </Button>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead sx={{ background: "#f0f4f9" }}>
                    <TableRow>
                      <TableCell
                        sx={{ fontWeight: "bold", width: columnWidths.index }}
                      >
                        अ. क्रं
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          width: columnWidths.routeCode,
                        }}
                      >
                        रूट कोड
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          width: columnWidths.routeName,
                        }}
                      >
                        रूट नाव
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          width: columnWidths.vehicleNo,
                        }}
                      >
                        वाहन क्रमांक
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          width: columnWidths.agentName,
                        }}
                      >
                        एजंट नाव
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          width: columnWidths.agentCode,
                        }}
                      >
                        एजंट कोड
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          width: columnWidths.totalOrder,
                        }}
                      >
                        एकूण ऑर्डर (₹)
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          width: columnWidths.status,
                          textAlign: "center",
                        }}
                      >
                        स्थिती
                      </TableCell>
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

      {/* normal snack */}
      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack({ ...snack, open: false })}
      >
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>

      {/* Confirm Accept */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Confirm</DialogTitle>
        <DialogContent>
          <Typography>
            You are about to accept {confirmPayload.orders?.length || 0}{" "}
            order(s) for {confirmPayload.section}. Continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={() => doConfirm()}
            variant="contained"
            disabled={processing}
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
