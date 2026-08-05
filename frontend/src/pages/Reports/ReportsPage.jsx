import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Row, Col, Card, Table, Typography, Tag, Tabs, Spin, Statistic, Space,
  DatePicker, Segmented, Button, Divider, message, Input, Modal, Radio, Select,
} from 'antd'
import {
  TeamOutlined, BankOutlined, CreditCardOutlined, WarningOutlined,
  CalendarOutlined, SafetyOutlined, DollarOutlined, ArrowUpOutlined,
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import dayjs from 'dayjs'
import * as reportsApi from '../../api/reports'
import { exportOverdue, exportPeriodReport, downloadBlob, exportWelfareReport, exportLoanReport } from '../../api/imports'
import { formatCurrency, formatDate } from '../../utils/formatters'
import ExportButton from '../../components/ExportButton'
import StatusBadge from '../../components/StatusBadge'

const { Title, Text } = Typography
const { Option } = Select

const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#d97706', '#ef4444', '#ec4899', '#14b8a6']

// ─────────────────────────────────────────────────────────────
// Period Report sub-component
// ─────────────────────────────────────────────────────────────
const PeriodReport = () => {
  const [period, setPeriod] = useState('monthly')
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [dateRange, setDateRange] = useState([dayjs().subtract(30, 'day'), dayjs()])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      let params = { period }
      if (period === 'daily') {
        params.date = selectedDate.format('YYYY-MM-DD')
      } else if (period === 'monthly') {
        params.month = selectedDate.format('YYYY-MM')
      } else if (period === 'yearly') {
        params.year = selectedDate.format('YYYY')
      } else if (period === 'custom') {
        if (dateRange && dateRange[0] && dateRange[1]) {
          params.start_date = dateRange[0].format('YYYY-MM-DD')
          params.end_date = dateRange[1].format('YYYY-MM-DD')
        }
      }
      const res = await exportPeriodReport(params)
      downloadBlob(res.data, `report_${period}_${dayjs().format('YYYY-MM-DD')}.xlsx`)
    } catch (_) {
      message.error('Failed to download report.')
    }
    setDownloading(false)
  }

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      let params = { period }
      if (period === 'daily') {
        params.date = selectedDate.format('YYYY-MM-DD')
      } else if (period === 'monthly') {
        params.month = selectedDate.format('YYYY-MM')
      } else if (period === 'yearly') {
        params.year = selectedDate.format('YYYY')
      } else if (period === 'custom') {
        if (dateRange && dateRange[0] && dateRange[1]) {
          params.start_date = dateRange[0].format('YYYY-MM-DD')
          params.end_date = dateRange[1].format('YYYY-MM-DD')
        }
      }
      const res = await reportsApi.getPeriodReport(params)
      setData(res.data)
    } catch (_) {}
    setLoading(false)
  }, [period, selectedDate, dateRange])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const pickerType = period === 'daily' ? 'date' : period === 'monthly' ? 'month' : 'year'

  const summaryCards = data ? [
    {
      label: 'Total Inflow',
      value: formatCurrency(data.total_inflow),
      icon: <ArrowUpOutlined />,
      color: '#2563eb',
      bg: '#eff6ff',
    },
    {
      label: 'Welfare Collections',
      value: formatCurrency(data.welfare_collections),
      sub: `${data.welfare_count} payments`,
      icon: <SafetyOutlined />,
      color: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      label: 'Loan Repayments',
      value: formatCurrency(data.loan_repayments),
      sub: `${data.loan_repayment_count} payments`,
      icon: <CreditCardOutlined />,
      color: '#0891b2',
      bg: '#ecfeff',
    },
    {
      label: 'Dues Collected',
      value: formatCurrency(data.dues_collected),
      icon: <DollarOutlined />,
      color: '#d97706',
      bg: '#fffbeb',
    },
    {
      label: 'Masavari Collected',
      value: formatCurrency(data.masavari_collected || 0),
      sub: `${data.masavari_count || 0} payments`,
      icon: <CalendarOutlined />,
      color: '#10b981',
      bg: '#ecfdf5',
    },
    {
      label: 'Registration & Capital',
      value: formatCurrency(data.deposits_made || 0),
      icon: <SafetyOutlined />,
      color: '#0891b2',
      bg: '#ecfeff',
    },
    {
      label: 'Other Profits & Surcharges',
      value: formatCurrency(data.other_incomes || 0),
      sub: `${data.other_incomes_count || 0} items`,
      icon: <DollarOutlined />,
      color: '#10b981',
      bg: '#ecfdf5',
    },
    {
      label: 'New Members',
      value: data.new_members,
      icon: <TeamOutlined />,
      color: '#16a34a',
      bg: '#f0fdf4',
    },
    {
      label: 'New Loans',
      value: `${data.new_loans}`,
      sub: data.new_loans > 0 ? formatCurrency(data.new_loans_amount) : '',
      icon: <BankOutlined />,
      color: '#dc2626',
      bg: '#fef2f2',
    },
  ] : []

  return (
    <div>
      {/* Controls */}
      <Card style={{ marginBottom: 20, border: '1px solid #bfdbfe', background: '#eff6ff' }} bodyStyle={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined style={{ color: '#2563eb', fontSize: 16 }} />
            <Text style={{ fontWeight: 600, color: '#1e40af' }}>Report Period:</Text>
          </div>
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { label: 'Daily', value: 'daily' },
              { label: 'Monthly', value: 'monthly' },
              { label: 'Yearly', value: 'yearly' },
              { label: 'Custom Range', value: 'custom' },
            ]}
            style={{ fontWeight: 600 }}
          />
          {period !== 'custom' ? (
            <DatePicker
              picker={pickerType}
              value={selectedDate}
              onChange={(val) => val && setSelectedDate(val)}
              format={period === 'daily' ? 'DD/MM/YYYY' : period === 'monthly' ? 'MMM YYYY' : 'YYYY'}
              allowClear={false}
              style={{ minWidth: 150 }}
            />
          ) : (
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(val) => val && setDateRange(val)}
              format="DD/MM/YYYY"
              allowClear={false}
              style={{ minWidth: 250 }}
            />
          )}
          <Button
            type="primary"
            onClick={fetchReport}
            loading={loading}
            style={{ background: '#1e40af', borderColor: '#1e40af' }}
          >
            Generate Report
          </Button>
          {data && (
            <>
              <Button
                type="default"
                onClick={handleDownload}
                loading={downloading}
                style={{ background: 'var(--color-bg-elevated)', color: '#2563eb', borderColor: '#2563eb' }}
              >
                Download Excel
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  if (!data) return
                  const printWindow = window.open('', '_blank')
                  printWindow.document.write(`
                    <html>
                      <head>
                         <title>Report — ${data.label}</title>
                        <style>
                          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
                          h1 { margin: 0 0 10px; color: #1e40af; font-size: 24px; }
                          h2 { margin: 25px 0 10px; color: #334155; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; }
                          .header { margin-bottom: 30px; text-align: center; border-bottom: 3px double #cbd5e1; padding-bottom: 15px; }
                          .meta { font-size: 14px; color: #64748b; margin-top: 5px; }
                          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
                          .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
                          .summary-card .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
                          .summary-card .value { font-size: 18px; font-weight: 700; color: #1e40af; margin-top: 4px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
                          th { background: #f1f5f9; color: #334155; font-weight: 600; }
                          tr:nth-child(even) { background: #f8fafc; }
                        </style>
                      </head>
                      <body>
                        <div class="header">
                          <h1 style="font-family: 'Noto Sans Malayalam', sans-serif;">കേരള വ്യാപാരി വ്യവസായി ഏകോപന സമിതി Azhikode Paybazar Unit (Reg No. 262/81)</h1>
                          <div style="font-weight: bold; font-size: 16px;">FINANCIAL PERIOD REPORT</div>
                          <div class="meta">Report Period: ${data.label} (${data.start} to ${data.end})</div>
                        </div>
                        
                        <div class="summary-grid">
                          <div class="summary-card">
                            <div class="label">Total Inflow</div>
                            <div class="value">₹${parseFloat(data.total_inflow).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                          <div class="summary-card">
                            <div class="label">Welfare Collections</div>
                            <div class="value">₹${parseFloat(data.welfare_collections).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                          <div class="summary-card">
                            <div class="label">Loan Repayments</div>
                            <div class="value">₹${parseFloat(data.loan_repayments).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                          <div class="summary-card">
                            <div class="label">Masavari Collected</div>
                            <div class="value">₹${parseFloat(data.masavari_collected).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                          <div class="summary-card">
                            <div class="label">Dues Collected</div>
                            <div class="value">₹${parseFloat(data.dues_collected).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                          <div class="summary-card">
                            <div class="label">Registration Fees</div>
                            <div class="value">₹${parseFloat(data.deposits_made).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                          <div class="summary-card">
                            <div class="label">Other Profits & Surcharges</div>
                            <div class="value">₹${parseFloat(data.other_incomes || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                          <div class="summary-card">
                            <div class="label">Total Expenses</div>
                            <div class="value">₹${parseFloat(data.total_expenses || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                          <div class="summary-card">
                            <div class="label">Net Balance</div>
                            <div class="value">₹${(parseFloat(data.total_inflow) - parseFloat(data.total_expenses || 0)).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                          </div>
                        </div>
                  `)

                  if (data.new_members_list && data.new_members_list.length > 0) {
                    printWindow.document.write(`
                      <h2>New Members Registered (${data.new_members})</h2>
                      <table>
                        <thead>
                          <tr><th>Member No</th><th>Full Name</th><th>Joining Date</th><th>Type</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          ${data.new_members_list.map(m => `
                            <tr><td>${m.member_no}</td><td>${m.full_name}</td><td>${m.joining_date}</td><td>${m.membership_type}</td><td>${m.status}</td></tr>
                          `).join('')}
                        </tbody>
                      </table>
                    `)
                  }

                  if (data.welfare_list && data.welfare_list.length > 0) {
                    printWindow.document.write(`
                      <h2>Welfare Instalments Collected (${data.welfare_list.length})</h2>
                      <table>
                        <thead>
                          <tr><th>Member / Non-Member</th><th>Welfare Scheme</th><th>Month #</th><th>Amount</th><th>Paid Date</th><th>Receipt</th></tr>
                        </thead>
                        <tbody>
                          ${data.welfare_list.map(w => `
                            <tr>
                              <td>${w.enrollment__member__full_name || w.enrollment__non_member_name} (${w.enrollment__member__member_no || 'Non-Member'})</td>
                              <td>${w.enrollment__chit_group__group_name}</td>
                              <td>${w.month_number}</td>
                              <td>₹${parseFloat(w.amount_paid).toFixed(2)}</td>
                              <td>${w.paid_date}</td>
                              <td>${w.receipt_no || '—'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    `)
                  }

                  if (data.loan_list && data.loan_list.length > 0) {
                    printWindow.document.write(`
                      <h2>Loan Repayments / EMIs Collected (${data.loan_list.length})</h2>
                      <table>
                        <thead>
                          <tr><th>Member</th><th>Loan No</th><th>EMI #</th><th>Principal</th><th>Service Charge</th><th>Total Paid</th><th>Paid Date</th></tr>
                        </thead>
                        <tbody>
                          ${data.loan_list.map(l => `
                            <tr>
                              <td>${l.loan__member__full_name} (${l.loan__member__member_no})</td>
                              <td>${l.loan__loan_no}</td>
                              <td>${l.instalment_no}</td>
                              <td>₹${parseFloat(l.principal_paid).toFixed(2)}</td>
                              <td>₹${parseFloat(l.interest_paid).toFixed(2)}</td>
                              <td>₹${parseFloat(l.amount_paid).toFixed(2)}</td>
                              <td>${l.paid_date}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    `)
                  }

                  if (data.masavari_list && data.masavari_list.length > 0) {
                    printWindow.document.write(`
                      <h2>Masavari (Membership) Payments (${data.masavari_list.length})</h2>
                      <table>
                        <thead>
                          <tr><th>Member</th><th>Period</th><th>Amount</th><th>Paid Date</th><th>Receipt No</th></tr>
                        </thead>
                        <tbody>
                          ${data.masavari_list.map(m => `
                            <tr>
                              <td>${m.member__full_name} (${m.member__member_no})</td>
                              <td>Month ${m.month}/${m.year}</td>
                              <td>₹${parseFloat(m.amount).toFixed(2)}</td>
                              <td>${m.paid_date}</td>
                              <td>${m.receipt_no || '—'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    `)
                  }

                  if (data.welfare_winners_list && data.welfare_winners_list.length > 0) {
                    printWindow.document.write(`
                      <h2>Welfare Winners & profits (${data.welfare_winners_list.length})</h2>
                      <table>
                        <thead>
                          <tr><th>Recipient</th><th>Scheme</th><th>Ticket #</th><th>Prize Amount</th><th>Surcharge (Profit)</th><th>Late Reduction</th><th>Draw Date</th><th>Payout Date</th><th>Payment Details</th></tr>
                        </thead>
                        <tbody>
                          ${data.welfare_winners_list.map(w => {
                            const pm = w.payout_payment_mode ? w.payout_payment_mode.replace('_', ' ').toUpperCase() : 'CASH';
                            const chq = w.cheque_number ? `(${w.cheque_number})` : '';
                            return `
                              <tr>
                                <td>${w.member__full_name || w.non_member_name} (${w.member__member_no || 'Non-Member'})</td>
                                <td>${w.chit_group__group_name}</td>
                                <td>${w.ticket_number}</td>
                                <td>₹${parseFloat(w.prize_amount).toFixed(2)}</td>
                                <td>₹${parseFloat(w.surcharge_amount).toFixed(2)}</td>
                                <td>₹${parseFloat(w.reduction_amount).toFixed(2)}</td>
                                <td>${w.prize_date}</td>
                                <td>${w.received_date ? w.received_date : '<span style="color: #d97706; font-weight: bold;">Pending</span>'}</td>
                                <td>${w.received_date ? `${pm} ${chq}` : '—'}</td>
                              </tr>
                            `;
                          }).join('')}
                        </tbody>
                      </table>
                    `)
                  }

                  if (data.deposits_list && data.deposits_list.length > 0) {
                    printWindow.document.write(`
                      <h2>Registration Fees & Share Capital Deposits (${data.deposits_list.length})</h2>
                      <table>
                        <thead>
                          <tr><th>Member</th><th>Deposit Type</th><th>Amount</th><th>Paid Date</th><th>Receipt No</th></tr>
                        </thead>
                        <tbody>
                          ${data.deposits_list.map(d => `
                            <tr>
                              <td>${d.member__full_name || '—'} (${d.member__member_no || '—'})</td>
                              <td>${d.deposit_type === 'membership_fee' ? 'Registration Fee' : 'Share Capital'}</td>
                              <td>₹${parseFloat(d.amount).toFixed(2)}</td>
                              <td>${d.deposit_date}</td>
                              <td>${d.receipt_no || '—'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    `)
                  }

                  if (data.other_incomes_list && data.other_incomes_list.length > 0) {
                    printWindow.document.write(`
                      <h2>Other Profits & Surcharges Collected (${data.other_incomes_list.length})</h2>
                      <table>
                        <thead>
                          <tr><th>Recipient</th><th>Category</th><th>Description</th><th>Amount</th><th>Date</th><th>Mode</th></tr>
                        </thead>
                        <tbody>
                          ${data.other_incomes_list.map(oi => `
                            <tr>
                              <td>${oi.member__full_name || '—'} (${oi.member__member_no || 'Non-Member'})</td>
                              <td style="text-transform: capitalize;">${oi.category.replace(/_/g, ' ')}</td>
                              <td>${oi.description || '—'}</td>
                              <td>₹${parseFloat(oi.amount).toFixed(2)}</td>
                              <td>${oi.date}</td>
                              <td style="text-transform: capitalize;">${oi.payment_mode || 'cash'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    `)
                  }

                  if (data.expenses_list && data.expenses_list.length > 0) {
                    printWindow.document.write(`
                      <h2>Office Expenses Paid (${data.expenses_list.length})</h2>
                      <table>
                        <thead>
                          <tr><th>Category</th><th>Description</th><th>Amount</th><th>Date</th></tr>
                        </thead>
                        <tbody>
                          ${data.expenses_list.map(e => `
                            <tr>
                              <td style="text-transform: capitalize;">${e.category.replace(/_/g, ' ')}</td>
                              <td>${e.description}</td>
                              <td>₹${parseFloat(e.amount).toFixed(2)}</td>
                              <td>${e.date}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    `)
                  }

                  printWindow.document.write(`
                      </body>
                    </html>
                  `)
                  printWindow.document.close()
                  printWindow.focus()
                  setTimeout(() => {
                    printWindow.print()
                  }, 500)
                }}
                style={{ background: '#10b981', borderColor: '#10b981' }}
              >
                Print Report
              </Button>
              <Text style={{ color: '#1e40af', fontWeight: 600, fontSize: 14 }}>
                📊 {data.label} ({data.start} → {data.end})
              </Text>
            </>
          )}
        </div>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {summaryCards.map((card) => (
              <Col key={card.label} xs={24} sm={12} lg={8} xl={4}>
                <Card
                  bodyStyle={{ padding: '16px 18px' }}
                  style={{
                    border: `1px solid ${card.color}30`,
                    background: card.bg,
                    borderRadius: 12,
                    boxShadow: `0 2px 12px ${card.color}15`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <Text style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {card.label}
                      </Text>
                      <div style={{ fontSize: 20, fontWeight: 700, color: card.color, marginTop: 4 }}>
                        {card.value}
                      </div>
                      {card.sub && (
                        <Text style={{ fontSize: 11, color: '#9ca3af' }}>{card.sub}</Text>
                      )}
                    </div>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: `${card.color}20`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: card.color, fontSize: 16,
                    }}>
                      {card.icon}
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          {/* New Members Table */}
          {data.new_members_list && data.new_members_list.length > 0 && (
            <Card
              title={
                <Space>
                  <TeamOutlined style={{ color: '#16a34a' }} />
                  <Text style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    New Members Joined ({data.new_members})
                  </Text>
                </Space>
              }
              style={{ marginBottom: 20 }}
            >
              <Table
                dataSource={data.new_members_list}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: true }}
                columns={[
                  { title: 'Member No', dataIndex: 'member_no', render: (v) => <Text style={{ color: '#2563eb', fontWeight: 600 }}>{v}</Text> },
                  { title: 'Name', dataIndex: 'full_name' },
                  { title: 'Joining Date', dataIndex: 'joining_date', render: (v) => formatDate(v) },
                  { title: 'Type', dataIndex: 'membership_type', render: (v) => <StatusBadge status={v} /> },
                  { title: 'Status', dataIndex: 'status', render: (v) => <StatusBadge status={v} /> },
                ]}
              />
            </Card>
          )}

          {/* Welfare Collections Table */}
          {data.welfare_list && data.welfare_list.length > 0 && (
            <Card title={<Text style={{ fontWeight: 600 }}>Welfare Collections ({data.welfare_list.length})</Text>} style={{ marginBottom: 20 }}>
              <Table
                dataSource={data.welfare_list}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
                columns={[
                  { title: 'Member / Non-Member', render: (_, r) => r.enrollment__member__full_name || r.enrollment__non_member_name },
                  { title: 'Scheme', dataIndex: 'enrollment__chit_group__group_name' },
                  { title: 'Month #', dataIndex: 'month_number' },
                  { title: 'Amount', dataIndex: 'amount_paid', render: (v) => formatCurrency(v) },
                  { title: 'Paid Date', dataIndex: 'paid_date', render: (v) => formatDate(v) },
                  { title: 'Receipt No', dataIndex: 'receipt_no' },
                ]}
              />
            </Card>
          )}

          {/* Loan Repayments Table */}
          {data.loan_list && data.loan_list.length > 0 && (
            <Card title={<Text style={{ fontWeight: 600 }}>Loan Repayments ({data.loan_list.length})</Text>} style={{ marginBottom: 20 }}>
              <Table
                dataSource={data.loan_list}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
                columns={[
                  { title: 'Member', dataIndex: 'loan__member__full_name' },
                  { title: 'Loan No', dataIndex: 'loan__loan_no' },
                  { title: 'EMI #', dataIndex: 'instalment_no' },
                  { title: 'Principal Paid', dataIndex: 'principal_paid', render: (v) => formatCurrency(v) },
                  { title: 'Service Charge', dataIndex: 'interest_paid', render: (v) => formatCurrency(v) },
                  { title: 'Total Paid', dataIndex: 'amount_paid', render: (v) => formatCurrency(v) },
                  { title: 'Paid Date', dataIndex: 'paid_date', render: (v) => formatDate(v) },
                ]}
              />
            </Card>
          )}

          {/* Masavari Payments Table */}
          {data.masavari_list && data.masavari_list.length > 0 && (
            <Card title={<Text style={{ fontWeight: 600 }}>Masavari Payments ({data.masavari_list.length})</Text>} style={{ marginBottom: 20 }}>
              <Table
                dataSource={data.masavari_list}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
                columns={[
                  { title: 'Member', render: (_, r) => `${r.member__full_name} (${r.member__member_no})` },
                  { title: 'Period', render: (_, r) => `Month ${r.month}/${r.year}` },
                  { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
                  { title: 'Paid Date', dataIndex: 'paid_date', render: (v) => formatDate(v) },
                  { title: 'Receipt No', dataIndex: 'receipt_no' },
                ]}
              />
            </Card>
          )}

          {/* Welfare Winners & Profits Table */}
          {data.welfare_winners_list && data.welfare_winners_list.length > 0 && (
            <Card title={<Text style={{ fontWeight: 600 }}>Welfare Winner Drawings &amp; Profits ({data.welfare_winners_list.length})</Text>} style={{ marginBottom: 20 }}>
              <Table
                dataSource={data.welfare_winners_list}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
                columns={[
                  { title: 'Winner Recipient', render: (_, r) => r.member__full_name || r.non_member_name },
                  { title: 'Scheme', dataIndex: 'chit_group__group_name' },
                  { title: 'Ticket #', dataIndex: 'ticket_number' },
                  { title: 'Prize Amount', dataIndex: 'prize_amount', render: (v) => formatCurrency(v) },
                  { title: 'Surcharge (Firm Profit)', dataIndex: 'surcharge_amount', render: (v) => formatCurrency(v) },
                  { title: 'Grace Period Reduction', dataIndex: 'reduction_amount', render: (v) => formatCurrency(v) },
                  { title: 'Draw Date', dataIndex: 'prize_date', render: (v) => formatDate(v) },
                  { title: 'Payout Date', dataIndex: 'received_date', render: (v) => v ? formatDate(v) : <Tag color="warning">Pending</Tag> },
                  { 
                    title: 'Payment Details', 
                    key: 'payout_details', 
                    render: (_, r) => r.received_date ? (
                      <div>
                        <Tag color="cyan" style={{ textTransform: 'capitalize' }}>
                          {r.payout_payment_mode ? r.payout_payment_mode.replace('_', ' ') : 'Cash'}
                        </Tag>
                        {r.cheque_number && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Ref: {r.cheque_number}</div>}
                      </div>
                    ) : '—'
                  },
                ]}
              />
            </Card>
          )}

          {/* Other Profits & Surcharges Table */}
          {data.other_incomes_list && data.other_incomes_list.length > 0 && (
            <Card title={<Text style={{ fontWeight: 600 }}>Other Profits &amp; Surcharges ({data.other_incomes_list.length})</Text>} style={{ marginBottom: 20 }}>
              <Table
                dataSource={data.other_incomes_list}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
                columns={[
                  { title: 'Recipient', render: (_, r) => r.member__full_name ? `${r.member__full_name} (${r.member__member_no})` : 'Non-Member' },
                  { title: 'Category', dataIndex: 'category', render: (v) => <span style={{ textTransform: 'capitalize' }}>{v.replace(/_/g, ' ')}</span> },
                  { title: 'Description/Transaction Details', dataIndex: 'description' },
                  { title: 'Amount', dataIndex: 'amount', render: (v) => <span style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(v)}</span> },
                  { title: 'Date', dataIndex: 'date', render: (v) => formatDate(v) },
                  { title: 'Payment Mode', dataIndex: 'payment_mode', render: (v) => <span style={{ textTransform: 'capitalize' }}>{v}</span> },
                ]}
              />
            </Card>
          )}

          {/* Deposits Table */}
          {data.deposits_list && data.deposits_list.length > 0 && (
            <Card title={<Text style={{ fontWeight: 600 }}>Registration Fees &amp; Capital Deposits ({data.deposits_list.length})</Text>} style={{ marginBottom: 20 }}>
              <Table
                dataSource={data.deposits_list}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
                columns={[
                  { title: 'Member', render: (_, r) => `${r.member__full_name || '—'} (${r.member__member_no || '—'})` },
                  { title: 'Type', dataIndex: 'deposit_type', render: (v) => v === 'membership_fee' ? 'Registration Fee' : 'Share Capital' },
                  { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
                  { title: 'Date', dataIndex: 'deposit_date', render: (v) => formatDate(v) },
                  { title: 'Receipt No', dataIndex: 'receipt_no' },
                ]}
              />
            </Card>
          )}

          {/* Expenses Table */}
          {data.expenses_list && data.expenses_list.length > 0 && (
            <Card title={<Text style={{ fontWeight: 600 }}>General Expenses Paid ({data.expenses_list.length})</Text>} style={{ marginBottom: 20 }}>
              <Table
                dataSource={data.expenses_list}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
                columns={[
                  { title: 'Category', dataIndex: 'category', render: (v) => <span style={{ textTransform: 'capitalize' }}>{v.replace(/_/g, ' ')}</span> },
                  { title: 'Description/Voucher Details', dataIndex: 'description' },
                  { title: 'Amount', dataIndex: 'amount', render: (v) => <span style={{ color: '#ef4444', fontWeight: 600 }}>{formatCurrency(v)}</span> },
                  { title: 'Date', dataIndex: 'date', render: (v) => formatDate(v) },
                ]}
              />
            </Card>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          Select a period and click Generate Report
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Welfare Report sub-component
// ─────────────────────────────────────────────────────────────
const WelfareReport = ({ chitsSummary }) => {
  const [dateRange, setDateRange] = useState([dayjs().subtract(3, 'month'), dayjs().add(1, 'month')])
  const [selectedMember, setSelectedMember] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [status, setStatus] = useState('all')
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const loadMembers = async (search = '') => {
    setMembersLoading(true)
    try {
      const res = await membersApi.getMembers({ search, page_size: 100 })
      setMembers(res.data.results || res.data)
    } catch (_) {}
    setMembersLoading(false)
  }

  useEffect(() => {
    loadMembers()
  }, [])

  const fetchReport = async () => {
    setLoading(true)
    try {
      const params = { status }
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.start_date = dateRange[0].format('YYYY-MM-DD')
        params.end_date = dateRange[1].format('YYYY-MM-DD')
      }
      if (selectedMember) params.member = selectedMember
      if (selectedGroup) params.chit_group = selectedGroup
      
      const res = await reportsApi.getWelfarePaymentsReport(params)
      setResults(res.data.results || [])
    } catch (_) {
      message.error('Failed to generate welfare report.')
    }
    setLoading(false)
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const params = { status }
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.start_date = dateRange[0].format('YYYY-MM-DD')
        params.end_date = dateRange[1].format('YYYY-MM-DD')
      }
      if (selectedMember) params.member = selectedMember
      if (selectedGroup) params.chit_group = selectedGroup

      const res = await exportWelfareReport(params)
      downloadBlob(res.data, `welfare_report_${dayjs().format('YYYY-MM-DD')}.xlsx`)
    } catch (_) {
      message.error('Failed to export Excel report.')
    }
    setDownloading(false)
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=600')
    const dateLabel = new Date().toLocaleDateString('en-IN')
    const dateRangeLabel = dateRange && dateRange[0] && dateRange[1] 
      ? `${dateRange[0].format('DD/MM/YYYY')} to ${dateRange[1].format('DD/MM/YYYY')}` 
      : 'All Time'

    const rows = results.map((item, idx) => {
      const itemStatus = item.is_paid ? 'Paid' : (item.is_overdue ? 'Overdue' : 'Pending')
      const color = item.is_paid ? 'green' : (item.is_overdue ? 'red' : 'black')
      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${item.member_name}</strong> (${item.member_no})</td>
          <td>${item.group_name}</td>
          <td>Month ${item.month_number}</td>
          <td>₹${parseFloat(item.installment_amount).toFixed(2)}</td>
          <td>₹${parseFloat(item.amount_paid).toFixed(2)}</td>
          <td>${formatDate(item.due_date)}</td>
          <td>${item.paid_date ? formatDate(item.paid_date) : '—'}</td>
          <td style="color: ${color}; font-weight: bold;">${itemStatus}</td>
        </tr>
      `
    }).join('')

    const totalDue = results.reduce((sum, item) => sum + parseFloat(item.installment_amount || 0), 0)
    const totalPaid = results.reduce((sum, item) => sum + parseFloat(item.amount_paid || 0), 0)

    printWindow.document.write(`
      <html>
        <head>
          <title>Welfare Fund Payments Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #333; }
            h1 { font-size: 20px; margin-bottom: 5px; }
            .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #f9fafb; }
          </style>
        </head>
        <body>
          <h1 style="font-family: 'Noto Sans Malayalam', sans-serif;">കേരള വ്യാപാരി വ്യവസായി ഏകോപന സമിതി Azhikode Paybazar Unit (Reg No. 262/81)</h1>
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px;">WELFARE FUND PAYMENTS REPORT</div>
          <div class="meta">
            <strong>Date Range:</strong> ${dateRangeLabel} | <strong>Generated:</strong> ${dateLabel} | <strong>Total Records:</strong> ${results.length}
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Member</th>
                <th>Welfare Scheme</th>
                <th>Month</th>
                <th>Required (₹)</th>
                <th>Paid (₹)</th>
                <th>Due Date</th>
                <th>Paid Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">Total:</td>
                <td>₹${totalDue.toFixed(2)}</td>
                <td>₹${totalPaid.toFixed(2)}</td>
                <td colspan="3"></td>
              </tr>
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div>
      <Card style={{ marginBottom: 16, background: '#fafafa' }} bodyStyle={{ padding: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Date Range</div>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={setDateRange}
              format="DD/MM/YYYY"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Filter Member</div>
            <Select
              showSearch
              placeholder="All Members"
              allowClear
              value={selectedMember}
              onChange={setSelectedMember}
              filterOption={false}
              onSearch={loadMembers}
              style={{ width: '100%' }}
            >
              {members.map(m => (
                <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Welfare Scheme</div>
            <Select
              placeholder="All Schemes"
              allowClear
              value={selectedGroup}
              onChange={setSelectedGroup}
              style={{ width: '100%' }}
            >
              {(chitsSummary?.by_group || []).map(g => (
                <Option key={g.group_no} value={g.group_no}>{g.group_name}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Status</div>
            <Select
              value={status}
              onChange={setStatus}
              style={{ width: '100%' }}
            >
              <Option value="all">All Payments</Option>
              <Option value="paid">Paid</Option>
              <Option value="pending">Pending</Option>
              <Option value="overdue">Overdue</Option>
            </Select>
          </Col>
          <Col xs={24} style={{ textAlign: 'right', marginTop: 8 }}>
            <Space>
              <Button type="primary" onClick={fetchReport} loading={loading}>
                Generate Report
              </Button>
              {results.length > 0 && (
                <>
                  <Button type="default" onClick={handlePrint}>
                    Print Report
                  </Button>
                  <Button type="default" onClick={handleDownload} loading={downloading}>
                    Export Excel
                  </Button>
                </>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Table
        dataSource={results}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 20 }}
        loading={loading}
        columns={[
          { title: 'Member', key: 'member', render: (_, r) => <span>{r.member_name} ({r.member_no})</span> },
          { title: 'Scheme', dataIndex: 'group_name' },
          { title: 'Month', dataIndex: 'month_number', render: v => `Month ${v}` },
          { title: 'Required', dataIndex: 'installment_amount', render: v => formatCurrency(v) },
          { title: 'Paid', dataIndex: 'amount_paid', render: v => formatCurrency(v) },
          { title: 'Due Date', dataIndex: 'due_date', render: v => formatDate(v) },
          { title: 'Paid Date', dataIndex: 'paid_date', render: v => v ? formatDate(v) : '—' },
          {
            title: 'Status', key: 'status',
            render: (_, r) => r.is_paid 
              ? <Tag color="success">Paid</Tag>
              : (r.is_overdue ? <Tag color="error">Overdue ({r.days_overdue}d)</Tag> : <Tag color="default">Pending</Tag>)
          }
        ]}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Loan Report sub-component
// ─────────────────────────────────────────────────────────────
const LoanReport = () => {
  const [dateRange, setDateRange] = useState([dayjs().subtract(3, 'month'), dayjs().add(1, 'month')])
  const [selectedMember, setSelectedMember] = useState(null)
  const [status, setStatus] = useState('all')
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const loadMembers = async (search = '') => {
    setMembersLoading(true)
    try {
      const res = await membersApi.getMembers({ search, page_size: 100 })
      setMembers(res.data.results || res.data)
    } catch (_) {}
    setMembersLoading(false)
  }

  useEffect(() => {
    loadMembers()
  }, [])

  const fetchReport = async () => {
    setLoading(true)
    try {
      const params = { status }
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.start_date = dateRange[0].format('YYYY-MM-DD')
        params.end_date = dateRange[1].format('YYYY-MM-DD')
      }
      if (selectedMember) params.member = selectedMember
      
      const res = await reportsApi.getLoanRepaymentsReport(params)
      setResults(res.data.results || [])
    } catch (_) {
      message.error('Failed to generate loan report.')
    }
    setLoading(false)
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const params = { status }
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.start_date = dateRange[0].format('YYYY-MM-DD')
        params.end_date = dateRange[1].format('YYYY-MM-DD')
      }
      if (selectedMember) params.member = selectedMember

      const res = await exportLoanReport(params)
      downloadBlob(res.data, `loan_report_${dayjs().format('YYYY-MM-DD')}.xlsx`)
    } catch (_) {
      message.error('Failed to export Excel report.')
    }
    setDownloading(false)
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=600')
    const dateLabel = new Date().toLocaleDateString('en-IN')
    const dateRangeLabel = dateRange && dateRange[0] && dateRange[1] 
      ? `${dateRange[0].format('DD/MM/YYYY')} to ${dateRange[1].format('DD/MM/YYYY')}` 
      : 'All Time'

    const rows = results.map((item, idx) => {
      const itemStatus = item.is_paid ? 'Paid' : (item.is_overdue ? 'Overdue' : 'Pending')
      const color = item.is_paid ? 'green' : (item.is_overdue ? 'red' : 'black')
      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${item.member_name}</strong> (${item.member_no})</td>
          <td>${item.loan_no}</td>
          <td>EMI ${item.instalment_no}</td>
          <td>₹${parseFloat(item.amount_paid).toFixed(2)}</td>
          <td>${formatDate(item.due_date)}</td>
          <td>${item.paid_date ? formatDate(item.paid_date) : '—'}</td>
          <td style="color: ${color}; font-weight: bold;">${itemStatus}</td>
        </tr>
      `
    }).join('')

    const totalPaid = results.reduce((sum, item) => sum + parseFloat(item.amount_paid || 0), 0)

    printWindow.document.write(`
      <html>
        <head>
          <title>Loan Repayments / EMI Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #333; }
            h1 { font-size: 20px; margin-bottom: 5px; }
            .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #f9fafb; }
          </style>
        </head>
        <body>
          <h1 style="font-family: 'Noto Sans Malayalam', sans-serif;">കേരള വ്യാപാരി വ്യവസായി ഏകോപന സമിതി Azhikode Paybazar Unit (Reg No. 262/81)</h1>
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px;">LOAN REPAYMENTS / EMI REPORT</div>
          <div class="meta">
            <strong>Date Range:</strong> ${dateRangeLabel} | <strong>Generated:</strong> ${dateLabel} | <strong>Total Records:</strong> ${results.length}
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Member</th>
                <th>Loan No</th>
                <th>EMI No</th>
                <th>Amount (₹)</th>
                <th>Due Date</th>
                <th>Paid Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">Total Amount:</td>
                <td>₹${totalPaid.toFixed(2)}</td>
                <td colspan="3"></td>
              </tr>
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div>
      <Card style={{ marginBottom: 16, background: '#fafafa' }} bodyStyle={{ padding: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Date Range</div>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={setDateRange}
              format="DD/MM/YYYY"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Filter Member</div>
            <Select
              showSearch
              placeholder="All Members"
              allowClear
              value={selectedMember}
              onChange={setSelectedMember}
              filterOption={false}
              onSearch={loadMembers}
              style={{ width: '100%' }}
            >
              {members.map(m => (
                <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Status</div>
            <Select
              value={status}
              onChange={setStatus}
              style={{ width: '100%' }}
            >
              <Option value="all">All Repayments</Option>
              <Option value="paid">Paid</Option>
              <Option value="pending">Pending</Option>
              <Option value="overdue">Overdue</Option>
            </Select>
          </Col>
          <Col xs={24} style={{ textAlign: 'right', marginTop: 8 }}>
            <Space>
              <Button type="primary" onClick={fetchReport} loading={loading}>
                Generate Report
              </Button>
              {results.length > 0 && (
                <>
                  <Button type="default" onClick={handlePrint}>
                    Print Report
                  </Button>
                  <Button type="default" onClick={handleDownload} loading={downloading}>
                    Export Excel
                  </Button>
                </>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Table
        dataSource={results}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 20 }}
        loading={loading}
        columns={[
          { title: 'Member', key: 'member', render: (_, r) => <span>{r.member_name} ({r.member_no})</span> },
          { title: 'Loan No', dataIndex: 'loan_no' },
          { title: 'EMI No', dataIndex: 'instalment_no', render: v => `EMI ${v}` },
          { title: 'Amount', dataIndex: 'amount_paid', render: v => formatCurrency(v) },
          { title: 'Due Date', dataIndex: 'due_date', render: v => formatDate(v) },
          { title: 'Paid Date', dataIndex: 'paid_date', render: v => v ? formatDate(v) : '—' },
          {
            title: 'Status', key: 'status',
            render: (_, r) => r.is_paid 
              ? <Tag color="success">Paid</Tag>
              : (r.is_overdue ? <Tag color="error">Overdue ({r.days_overdue}d)</Tag> : <Tag color="default">Pending</Tag>)
          }
        ]}
      />
    </div>
  )
}


// Main ReportsPage
// ─────────────────────────────────────────────────────────────
const ReportsPage = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboard, setDashboard] = useState(null)
  const [membersSummary, setMembersSummary] = useState(null)
  const [chitsSummary, setChitsSummary] = useState(null)
  const [loansSummary, setLoansSummary] = useState(null)
  const [duesSummary, setDuesSummary] = useState(null)
  const [overdueList, setOverdueList] = useState([])
  const [upcomingList, setUpcomingList] = useState([])
  const [duesFilterType, setDuesFilterType] = useState('overdue') // 'overdue' | 'upcoming'
  const [duesViewMode, setDuesViewMode] = useState('grouped') // 'grouped' | 'detailed'
  const [searchText, setSearchText] = useState('')
  const [memberDetailModal, setMemberDetailModal] = useState({ open: false, memberId: null, memberName: '', memberNo: '', dues: [] })
  const [loading, setLoading] = useState(true)
  const [asOfDate, setAsOfDate] = useState(dayjs())

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (dashboard) {
      loadOverdueData(asOfDate)
    }
  }, [asOfDate])

  const loadOverdueData = async (dateObj) => {
    try {
      const dateStr = dateObj ? dateObj.format('YYYY-MM-DD') : ''
      const res = await reportsApi.getOverdueList({ date: dateStr })
      setOverdueList(res.data?.overdue_list || [])
      setUpcomingList(res.data?.upcoming_list || [])
    } catch (_) {
      message.error('Failed to load overdue list for selected date.')
    }
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [dash, mem, chits, loans, dues] = await Promise.all([
        reportsApi.getDashboard(),
        reportsApi.getMembersSummary(),
        reportsApi.getChitsSummary(),
        reportsApi.getLoansSummary(),
        reportsApi.getDuesSummary(),
      ])
      setDashboard(dash.data)
      setMembersSummary(mem.data)
      setChitsSummary(chits.data)
      setLoansSummary(loans.data)
      setDuesSummary(dues.data)
      await loadOverdueData(asOfDate)
    } catch (_) {}
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  const overdueColumns = [
    {
      title: 'Type', dataIndex: 'type', key: 'type',
      render: (v) => (
        <Tag color={v === 'Welfare' || v === 'Welfare Payment' || v === 'Chit Payment' ? 'blue' : v === 'Loan EMI' ? 'purple' : 'orange'}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Member', key: 'member',
      render: (_, row) => (
        <a onClick={() => setMemberDetailModal({
          open: true,
          memberId: row.member_id,
          memberName: row.member_name,
          memberNo: row.member_no,
          dues: duesFilterType === 'overdue' 
            ? overdueList.filter(d => d.member_id === row.member_id) 
            : upcomingList.filter(d => d.member_id === row.member_id)
        })}>
          <div style={{ fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>{row.member_name}</div>
          <div style={{ fontSize: 11, color: '#9ba3bc' }}>{row.member_no}</div>
        </a>
      ),
    },
    { title: 'Amount', dataIndex: 'amount', render: (v) => <span style={{ color: '#ef4444', fontWeight: 600 }}>{formatCurrency(v)}</span> },
    { title: 'Due Date', dataIndex: 'due_date', render: (v) => formatDate(v) },
    { title: 'Days Overdue', dataIndex: 'days_overdue', render: (v) => <Tag color={v > 90 ? 'red' : 'orange'}>{v}d</Tag> },
    { title: 'Details', dataIndex: 'detail', render: (v) => <Text style={{ color: '#9ba3bc', fontSize: 12 }}>{v}</Text> },
  ]

  const groupedColumns = [
    {
      title: 'Member Name', key: 'member_name',
      render: (_, row) => (
        <a onClick={() => setMemberDetailModal({
          open: true,
          memberId: row.member_id,
          memberName: row.member_name,
          memberNo: row.member_no,
          dues: row.dues_list,
        })}>
          <div style={{ fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>{row.member_name}</div>
          <div style={{ fontSize: 11, color: '#9ba3bc' }}>{row.member_no}</div>
        </a>
      ),
    },
    {
      title: 'Categories', dataIndex: 'types_label', key: 'types_label',
      render: (v) => (
        <Space size={[4, 4]} wrap>
          {v.split(', ').map(t => (
            <Tag key={t} color={t === 'Welfare' ? 'blue' : t === 'Loan EMI' ? 'purple' : 'orange'}>
              {t}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: 'Dues List', key: 'dues_list',
      render: (_, row) => (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#9ba3bc' }}>
          {row.dues_list.slice(0, 3).map((d, idx) => (
            <li key={idx}>{d.detail} (₹{parseFloat(d.amount).toFixed(0)})</li>
          ))}
          {row.dues_list.length > 3 && <li>and {row.dues_list.length - 3} more...</li>}
        </ul>
      )
    },
    {
      title: 'Total Amount', dataIndex: 'total_amount', key: 'total_amount',
      render: (v) => <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 15 }}>{formatCurrency(v)}</span>,
      sorter: (a, b) => a.total_amount - b.total_amount,
    },
    {
      title: 'Action', key: 'action',
      render: (_, row) => (
        <Button size="small" type="primary" onClick={() => setMemberDetailModal({
          open: true,
          memberId: row.member_id,
          memberName: row.member_name,
          memberNo: row.member_no,
          dues: row.dues_list,
        })}>
          View Details
        </Button>
      )
    }
  ]

  // Get active list based on segmented select ('overdue' vs 'upcoming')
  const rawList = duesFilterType === 'overdue' ? overdueList : upcomingList

  const overdueSum = overdueList.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0)
  const upcomingSum = upcomingList.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0)

  // Filter raw list by searchText
  const filteredRawList = rawList.filter(item => {
    const text = searchText.toLowerCase()
    return (
      (item.member_name || '').toLowerCase().includes(text) ||
      (item.member_no || '').toLowerCase().includes(text) ||
      (item.detail || '').toLowerCase().includes(text) ||
      (item.type || '').toLowerCase().includes(text)
    )
  })

  // Calculate grouped list by member
  const getGroupedList = () => {
    const groups = {}
    filteredRawList.forEach(item => {
      const key = `${item.member_name}-${item.member_no}`
      if (!groups[key]) {
        groups[key] = {
          key,
          member_id: item.member_id,
          member_name: item.member_name,
          member_no: item.member_no,
          dues_list: [],
          total_amount: 0,
          types: new Set(),
        }
      }
      groups[key].dues_list.push(item)
      groups[key].total_amount += parseFloat(item.amount || 0)
      groups[key].types.add(item.type)
    })

    const groupedArray = Object.values(groups).map(g => ({
      ...g,
      types_label: Array.from(g.types).join(', '),
    }))

    groupedArray.sort((a, b) => (a.member_name || '').localeCompare(b.member_name || ''))
    return groupedArray
  }

  const groupedData = getGroupedList()

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=600')
    const title = `${duesFilterType === 'overdue' ? 'Overdue Dues' : 'Upcoming Dues'} Report`
    const dateLabel = asOfDate.format('DD/MM/YYYY')

    const tableRows = duesViewMode === 'grouped' 
      ? groupedData.map(g => `
        <tr>
          <td><strong>${g.member_name}</strong> (${g.member_no})</td>
          <td>${g.types_label}</td>
          <td>
            <ul style="margin: 0; padding-left: 16px;">
              ${g.dues_list.map(d => `<li>${d.detail} - <strong>₹${parseFloat(d.amount).toFixed(2)}</strong></li>`).join('')}
            </ul>
          </td>
          <td style="text-align: right; font-weight: bold; color: #d32f2f;">₹${g.total_amount.toFixed(2)}</td>
        </tr>
      `).join('')
      : filteredRawList.map((item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${item.member_name}</strong> (${item.member_no})</td>
          <td>${item.type}</td>
          <td>${item.detail}</td>
          <td>${formatDate(item.due_date)}</td>
          <td>${item.days_overdue}d</td>
          <td style="text-align: right; font-weight: bold; color: #d32f2f;">₹${parseFloat(item.amount).toFixed(2)}</td>
        </tr>
      `).join('')

    const totalSum = duesViewMode === 'grouped'
      ? groupedData.reduce((sum, g) => sum + g.total_amount, 0)
      : filteredRawList.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0)

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #333; }
            h1 { font-size: 20px; margin-bottom: 5px; }
            .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #fdf2f2; }
            ul { margin: 0; padding-left: 15px; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1 style="font-family: 'Noto Sans Malayalam', sans-serif;">കേരള വ്യാപാരി വ്യവസായി ഏകോപന സമിതി Azhikode Paybazar Unit (Reg No. 262/81)</h1>
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px;">DUES & OVERDUES REPORT</div>
          <div class="meta">
            <strong>Report Type:</strong> ${title} | <strong>Date:</strong> ${dateLabel} | <strong>View Mode:</strong> ${duesViewMode === 'grouped' ? 'Grouped by Member' : 'Detailed List'}
          </div>
          <table>
            <thead>
              ${duesViewMode === 'grouped' 
                ? '<tr><th>Member</th><th>Dues Categories</th><th>Dues List</th><th style="text-align: right;">Total Amount</th></tr>'
                : '<tr><th>#</th><th>Member</th><th>Type</th><th>Details</th><th>Due Date</th><th>Days Overdue</th><th style="text-align: right;">Amount</th></tr>'
              }
            </thead>
            <tbody>
              ${tableRows}
              <tr class="total-row">
                <td colspan="${duesViewMode === 'grouped' ? '3' : '6'}" style="text-align: right;">Grand Total:</td>
                <td style="text-align: right; color: #d32f2f;">₹${totalSum.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const welfareGroupColumns = [
    { title: 'Welfare No', dataIndex: 'group_no', render: (v) => <Text style={{ color: '#2563eb', fontWeight: 600 }}>{v}</Text> },
    { title: 'Name', dataIndex: 'group_name' },
    { title: 'Status', dataIndex: 'status', render: (v) => <Tag>{v}</Tag> },
    { title: 'Enrolled', dataIndex: 'enrolled_count' },
    { title: 'Expected Collections', dataIndex: 'total_expected', render: (v) => formatCurrency(v) },
    { title: 'Collected Dues', dataIndex: 'total_collected', render: (v) => <span style={{ color: '#2563eb', fontWeight: 600 }}>{formatCurrency(v)}</span> },
    { title: 'Payouts Made', dataIndex: 'total_payout_amount', render: (v) => formatCurrency(v) },
    { title: 'Commission & Surcharges (Profit)', dataIndex: 'total_commission_profit', render: (v) => <span style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(v)}</span> },
  ]

  const loansByStatus = loansSummary?.by_status || []

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={3} style={{ color: 'var(--color-text-primary)', margin: 0 }}>Reports & Analytics</Title>
          <Text style={{ color: 'var(--color-text-secondary)' }}>Financial overview and performance metrics</Text>
        </div>
        <ExportButton exportFn={exportOverdue} filename="kvva_overdue.xlsx">
          Export Overdue Report
        </ExportButton>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[

          /* ─── OVERVIEW TAB ─── */
          {
            key: 'overview',
            label: 'Overview',
            children: (
              <div>
                {/* Stat cards */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  {[
                    { label: 'Total Members', value: dashboard?.stats?.total_members || 0, color: '#2563eb', icon: <TeamOutlined /> },
                    { label: 'Active Welfare', value: dashboard?.stats?.active_chits || 0, color: '#7c3aed', icon: <SafetyOutlined /> },
                    { label: 'Active Loans', value: dashboard?.stats?.active_loans || 0, color: '#0891b2', icon: <CreditCardOutlined /> },
                    { label: 'Overdue Items', value: dashboard?.stats?.overdue_count || 0, color: '#ef4444', icon: <WarningOutlined /> },
                  ].map(card => (
                    <Col key={card.label} xs={12} lg={6}>
                      <Card className="stat-card" bodyStyle={{ padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <Text style={{ color: 'var(--color-text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{card.label}</Text>
                            <div style={{ fontSize: 26, fontWeight: 700, color: card.color, marginTop: 4 }}>
                              {card.value.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: `${card.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color, fontSize: 18 }}>
                            {card.icon}
                          </div>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>

                {/* Charts */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  <Col xs={24} lg={14}>
                    <Card title={<Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Monthly Welfare Collections (₹)</Text>}>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={dashboard?.monthly_chit_collections || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                          <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                          <Tooltip
                            formatter={v => formatCurrency(v)}
                            contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                            labelStyle={{ color: 'var(--color-text-primary)' }}
                          />
                          <Bar dataKey="total" fill="#2563eb" name="Welfare Collections" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                  <Col xs={24} lg={10}>
                    <Card title={<Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Members by Type</Text>}>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={membersSummary?.by_type || []}
                            dataKey="count"
                            nameKey="membership_type"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {(membersSummary?.by_type || []).map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                </Row>

                {/* Top overdue */}
                <Card title={
                  <Space>
                    <WarningOutlined style={{ color: '#ef4444' }} />
                    <Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Combined Overdue List ({overdueList.length})</Text>
                  </Space>
                }>
                  <Table
                    columns={overdueColumns}
                    dataSource={overdueList.slice(0, 20)}
                    rowKey={(_, i) => i}
                    pagination={false}
                    size="small"
                    scroll={{ x: true }}
                  />
                </Card>
              </div>
            ),
          },

          /* ─── PERIOD REPORTS TAB ─── */
          {
            key: 'period',
            label: (
              <span>
                <CalendarOutlined style={{ marginRight: 6 }} />
                Period Reports
              </span>
            ),
            children: <PeriodReport />,
          },

          /* ─── WELFARE TAB ─── */
          {
            key: 'chits',
            label: 'Welfare Funds',
            children: (
              <div>
                <Card title={<Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Welfare Payments Report (Adjust Dates & Filter by Member)</Text>} style={{ marginBottom: 24 }}>
                  <WelfareReport chitsSummary={chitsSummary} />
                </Card>
                <Card title={<Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Welfare Scheme Performance Summary</Text>}>
                  <Table
                    columns={welfareGroupColumns}
                    dataSource={chitsSummary?.by_group || []}
                    rowKey="group_no"
                    pagination={false}
                    scroll={{ x: true }}
                    id="chits-report-table"
                  />
                </Card>
              </div>
            ),
          },

          /* ─── LOANS TAB ─── */
          {
            key: 'loans',
            label: 'Loans',
            children: (
              <div>
                <Card title={<Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Loan Repayments / EMI Report (Adjust Dates & Filter by Member)</Text>} style={{ marginBottom: 24 }}>
                  <LoanReport />
                </Card>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  <Col xs={24} sm={12}>
                    <Card>
                      <Statistic
                        title={<Text style={{ color: 'var(--color-text-secondary)' }}>Total Outstanding</Text>}
                        value={parseFloat(loansSummary?.total_outstanding || 0)}
                        prefix="₹"
                        valueStyle={{ color: '#ef4444', fontWeight: 700 }}
                        formatter={v => parseFloat(v).toLocaleString('en-IN')}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card>
                      <Statistic
                        title={<Text style={{ color: 'var(--color-text-secondary)' }}>Total Repaid</Text>}
                        value={parseFloat(loansSummary?.total_repaid || 0)}
                        prefix="₹"
                        valueStyle={{ color: '#16a34a', fontWeight: 700 }}
                        formatter={v => parseFloat(v).toLocaleString('en-IN')}
                      />
                    </Card>
                  </Col>
                </Row>
                <Card title={<Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Loans by Status</Text>}>
                  <Table
                    dataSource={loansByStatus}
                    rowKey="status"
                    pagination={false}
                    id="loans-report-table"
                    columns={[
                      { title: 'Status', dataIndex: 'status', render: v => <Tag>{v}</Tag> },
                      { title: 'Count', dataIndex: 'count' },
                      { title: 'Total Amount', dataIndex: 'total', render: v => formatCurrency(v) },
                    ]}
                  />
                </Card>
              </div>
            ),
          },

          /* ─── DUES TAB ─── */
          {
            key: 'dues',
            label: 'Dues',
            children: (
              <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  <Col xs={24} sm={12}>
                    <Card>
                      <Statistic
                        title={<Text style={{ color: 'var(--color-text-secondary)' }}>Overdue Dues Count</Text>}
                        value={duesSummary?.overdue_count || 0}
                        valueStyle={{ color: '#ef4444', fontWeight: 700 }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card>
                      <Statistic
                        title={<Text style={{ color: 'var(--color-text-secondary)' }}>Overdue Amount</Text>}
                        value={parseFloat(duesSummary?.overdue_amount || 0)}
                        prefix="₹"
                        valueStyle={{ color: '#ef4444', fontWeight: 700 }}
                        formatter={v => parseFloat(v).toLocaleString('en-IN')}
                      />
                    </Card>
                  </Col>
                </Row>
                <Card title={<Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Dues by Status</Text>}>
                  <Table
                    dataSource={duesSummary?.by_status || []}
                    rowKey="status"
                    pagination={false}
                    id="dues-report-table"
                    columns={[
                      { title: 'Status', dataIndex: 'status', render: v => <Tag>{v}</Tag> },
                      { title: 'Count', dataIndex: 'count' },
                      { title: 'Total Amount', dataIndex: 'total', render: v => formatCurrency(v) },
                    ]}
                  />
                </Card>
              </div>
            ),
          },

          {
            key: 'overdue',
            label: 'Dues & Overdues Reports',
            children: (
              <div>
                <Card style={{ marginBottom: 16 }}>
                  <Row gutter={[16, 16]} align="middle" justify="space-between">
                    <Col xs={24} md={12}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text strong style={{ color: '#9ba3bc', fontSize: 12, textTransform: 'uppercase' }}>Dues Category</Text>
                        <Radio.Group 
                          value={duesFilterType} 
                          onChange={(e) => setDuesFilterType(e.target.value)}
                          optionType="button"
                          buttonStyle="solid"
                        >
                          <Radio.Button value="overdue">Overdue Dues (₹{overdueSum.toLocaleString('en-IN')})</Radio.Button>
                          <Radio.Button value="upcoming">Upcoming Dues (₹{upcomingSum.toLocaleString('en-IN')})</Radio.Button>
                        </Radio.Group>
                      </Space>
                    </Col>
                    <Col xs={24} md={12} style={{ textAlign: 'right' }}>
                      <Space direction="vertical" style={{ width: '100%', alignItems: 'flex-end' }}>
                        <Text strong style={{ color: '#9ba3bc', fontSize: 12, textTransform: 'uppercase' }}>View Format</Text>
                        <Radio.Group 
                          value={duesViewMode} 
                          onChange={(e) => setDuesViewMode(e.target.value)}
                          optionType="button"
                          buttonStyle="solid"
                        >
                          <Radio.Button value="grouped">Grouped by Member</Radio.Button>
                          <Radio.Button value="detailed">Detailed List</Radio.Button>
                        </Radio.Group>
                      </Space>
                    </Col>
                  </Row>

                  <Divider style={{ margin: '16px 0' }} />

                  <Row gutter={[16, 16]} align="middle" justify="space-between">
                    <Col xs={24} sm={12} md={10}>
                      <Input.Search
                        placeholder="Search member name or number..."
                        allowClear
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={14} style={{ textAlign: 'right' }}>
                      <Space wrap>
                        <DatePicker
                          value={asOfDate}
                          onChange={(val) => val && setAsOfDate(val)}
                          format="DD/MM/YYYY"
                          placeholder="As of Date"
                          style={{ width: 140 }}
                        />
                        <Button type="primary" onClick={handlePrint}>
                          Print Report
                        </Button>
                        <ExportButton 
                          exportFn={() => exportOverdue({ date: asOfDate.format('YYYY-MM-DD'), type: duesFilterType })} 
                          filename={duesFilterType === 'overdue' ? 'kvva_overdue.xlsx' : 'kvva_upcoming.xlsx'}
                        >
                          Export Excel
                        </ExportButton>
                      </Space>
                    </Col>
                  </Row>
                </Card>

                <Card title={
                  <Space>
                    <WarningOutlined style={{ color: duesFilterType === 'overdue' ? '#ef4444' : '#3b82f6' }} />
                    <Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                      {duesFilterType === 'overdue' ? 'Overdue Dues List' : 'Upcoming Dues List'} ({duesViewMode === 'grouped' ? groupedData.length : filteredRawList.length} records)
                    </Text>
                  </Space>
                }>
                  {duesViewMode === 'grouped' ? (
                    <Table
                      columns={groupedColumns}
                      dataSource={groupedData}
                      rowKey="key"
                      pagination={{ pageSize: 20 }}
                      size="small"
                      scroll={{ x: true }}
                    />
                  ) : (
                    <Table
                      columns={overdueColumns}
                      dataSource={filteredRawList}
                      rowKey={(_, i) => i}
                      pagination={{ pageSize: 25 }}
                      size="small"
                      scroll={{ x: true }}
                      rowClassName={() => duesFilterType === 'overdue' ? 'text-overdue' : ''}
                    />
                  )}
                </Card>

                {/* Member Dues Details Modal */}
                <Modal
                  title={`Dues Details — ${memberDetailModal.memberName} (${memberDetailModal.memberNo})`}
                  open={memberDetailModal.open}
                  onCancel={() => setMemberDetailModal({ open: false, memberId: null, memberName: '', memberNo: '', dues: [] })}
                  footer={[
                    <Button key="close" onClick={() => setMemberDetailModal({ open: false, memberId: null, memberName: '', memberNo: '', dues: [] })}>
                      Close
                    </Button>,
                    memberDetailModal.memberId && (
                      <Button key="profile" type="primary" onClick={() => {
                        setMemberDetailModal({ open: false, memberId: null, memberName: '', memberNo: '', dues: [] });
                        navigate(`/members/${memberDetailModal.memberId}`);
                      }}>
                        Go to Profile
                      </Button>
                    )
                  ]}
                  width={700}
                >
                  <Table
                    dataSource={memberDetailModal.dues}
                    rowKey={(_, i) => i}
                    size="small"
                    pagination={false}
                    columns={[
                      {
                        title: 'Type', dataIndex: 'type', key: 'type',
                        render: (v) => (
                          <Tag color={v === 'Welfare' ? 'blue' : v === 'Loan EMI' ? 'purple' : 'orange'}>
                            {v}
                          </Tag>
                        ),
                      },
                      { title: 'Details', dataIndex: 'detail', key: 'detail' },
                      { title: 'Due Date', dataIndex: 'due_date', render: (v) => formatDate(v) },
                      { 
                        title: 'Overdue', dataIndex: 'days_overdue', key: 'days_overdue',
                        render: (v) => v > 0 ? <Tag color="red">{v}d</Tag> : <Tag color="default">No</Tag>
                      },
                      { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v) => <span style={{ fontWeight: 600 }}>{formatCurrency(v)}</span> },
                    ]}
                  />
                  <div style={{ marginTop: 16, textAlign: 'right', fontSize: 16, fontWeight: 700 }}>
                    Total Due: <span style={{ color: '#ef4444' }}>
                      {formatCurrency(memberDetailModal.dues.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0))}
                    </span>
                  </div>
                </Modal>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

export default ReportsPage
