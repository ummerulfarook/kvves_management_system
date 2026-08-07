import { useEffect, useState, useCallback } from 'react'
import {
  Row, Col, Card, Form, Input, InputNumber, Button, Select, DatePicker,
  Table, Tag, Space, Tabs, Statistic, message, Divider, Typography, Modal, Radio
} from 'antd'
import {
  PlusOutlined, UnorderedListOutlined, BarChartOutlined, SearchOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import * as collectionsApi from '../../api/collections'
import * as membersApi from '../../api/members'
import * as curriesApi from '../../api/curries'
import * as chitsApi from '../../api/chits'
import { formatCurrency, formatDate } from '../../utils/formatters'
import usePermissions from '../../hooks/usePermissions'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

const safeParseFloat = (val) => {
  const parsed = parseFloat(val)
  return isNaN(parsed) ? undefined : parsed
}

const CollectionsPage = () => {
  const { canWrite } = usePermissions()
  const [form] = Form.useForm()

  const [activeTab, setActiveTab] = useState('entry')

  // Data lists
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Filters
  const [filterDate, setFilterDate] = useState(dayjs())
  const [filterMonth, setFilterMonth] = useState(dayjs())
  const [period, setPeriod] = useState('daily') // daily, monthly, yearly

  // Form options state
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)

  const [memberWelfares, setMemberWelfares] = useState([])
  const [memberLoans, setMemberLoans] = useState([])
  const [memberMasavari, setMemberMasavari] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Welfare non-members & all enrollments state
  const [nonMemberEnrollments, setNonMemberEnrollments] = useState([])
  const [nonMembersLoading, setNonMembersLoading] = useState(false)
  const [welfarePayerType, setWelfarePayerType] = useState('member')

  // Curry-specific state (loaded independently)
  const [allCurries, setAllCurries] = useState([])
  const [curriesLoading, setCurriesLoading] = useState(false)
  const [selectedCurry, setSelectedCurry] = useState(null)
  const [curryParticipants, setCurryParticipants] = useState([])
  const [participantsLoading, setParticipantsLoading] = useState(false)

  const [entryType, setEntryType] = useState('income')
  const [category, setCategory] = useState('')

  // Load lists
  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      let params = {}
      if (period === 'daily') {
        params.date = filterDate.format('YYYY-MM-DD')
      } else if (period === 'monthly') {
        params.month = filterMonth.format('YYYY-MM')
      } else {
        params.year = filterMonth.format('YYYY')
      }
      const res = await collectionsApi.getDailyEntries(params)
      setEntries(res.data.results || res.data)

      const sumRes = await collectionsApi.getDailySummary(params)
      setSummary(sumRes.data)
    } catch (_) {
      message.error('Failed to load collections.')
    }
    setLoading(false)
  }, [period, filterDate, filterMonth])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // Search members
  const loadMembersForSelect = useCallback(async (search = '') => {
    setMembersLoading(true)
    try {
      const res = await membersApi.getMembers({ search, status: 'active', page_size: 100 })
      setMembers(res.data.results || res.data)
    } catch (_) {}
    setMembersLoading(false)
  }, [])

  // Load all active curries for curry payment
  const loadAllCurries = useCallback(async () => {
    setCurriesLoading(true)
    try {
      const res = await curriesApi.getCurries({ status: 'active', page_size: 100 })
      setAllCurries(res.data.results || res.data)
    } catch (_) {}
    setCurriesLoading(false)
  }, [])

  // When a curry is selected, load its participants
  const handleCurryChange = async (curryId) => {
    setSelectedCurry(curryId)
    setCurryParticipants([])
    form.setFieldsValue({ participant_id: undefined, month_number: undefined })
    if (!curryId) return
    setParticipantsLoading(true)
    try {
      const res = await curriesApi.getCurryParticipants(curryId)
      setCurryParticipants((res.data.results || res.data).filter(p => p.status === 'active'))
    } catch (_) {
      message.error('Failed to load curry participants.')
    }
    setParticipantsLoading(false)
  }

  const autofillFields = (cat, memId, welfares = memberWelfares, loans = memberLoans, masavari = memberMasavari) => {
    if (!memId) return

    if (cat === 'masavari') {
      if (masavari && masavari.pending && masavari.pending.length === 0) {
        Modal.confirm({
          title: 'Masavari Up-to-Date',
          content: 'Masavari payments for this member are up-to-date. Do you want to record a payment for the next month?',
          okText: 'Yes, pay next month',
          cancelText: 'No, dismiss',
          onOk() {
            let nextMonth = new Date().getMonth() + 2
            if (nextMonth > 12) nextMonth = 1
            if (masavari && masavari.history && masavari.history.length > 0) {
              const latest = masavari.history[0]
              nextMonth = latest.month + 1
              if (nextMonth > 12) nextMonth = 1
            }
            const amt = safeParseFloat(masavari?.default_amount) || 50
            form.setFieldsValue({
              month_number: nextMonth,
              amount: amt,
            })
          },
          onCancel() {
            form.setFieldsValue({
              category: undefined,
              month_number: undefined,
              amount: undefined,
            })
            setCategory('')
          }
        })
      } else {
        const nextMonth = masavari?.pending?.[0]?.month || undefined
        const amt = safeParseFloat(masavari?.default_amount) || 50
        form.setFieldsValue({
          month_number: nextMonth,
          amount: amt,
        })
      }
    } else if (cat === 'welfare_payment') {
      if (welfares.length === 1) {
        const w = welfares[0]
        form.setFieldsValue({
          welfare_group: w.id,
          month_number: w.next_pending_month || undefined,
          amount: safeParseFloat(w.monthly_instalment),
        })
      } else {
        form.setFieldsValue({ welfare_group: undefined, month_number: undefined, amount: undefined })
      }
    } else if (cat === 'loan_emi') {
      if (loans.length === 1) {
        const l = loans[0]
        form.setFieldsValue({
          loan: l.id,
          month_number: l.next_pending_instalment || undefined,
          amount: safeParseFloat(l.emi_amount),
        })
      } else {
        form.setFieldsValue({ loan: undefined, month_number: undefined, amount: undefined })
      }
    } else {
      form.setFieldsValue({ welfare_group: undefined, loan: undefined, month_number: undefined, amount: undefined })
    }
  }

  const loadNonMemberEnrollments = useCallback(async () => {
    setNonMembersLoading(true)
    try {
      const res = await chitsApi.getAllEnrollments()
      const list = res.data.results || res.data || []
      // Non-member enrollments don't have a registered member
      setNonMemberEnrollments(list.filter(e => !e.member && (e.status === 'active' || e.status === 'awarded')))
    } catch (_) {
      message.error('Failed to load non-member subscribers.')
    }
    setNonMembersLoading(false)
  }, [])

  const handleWelfarePayerTypeChange = (type) => {
    setWelfarePayerType(type)
    form.setFieldsValue({ welfare_group: undefined, member: undefined, month_number: undefined, amount: undefined })
    if (type === 'non_member' && nonMemberEnrollments.length === 0) {
      loadNonMemberEnrollments()
    }
  }

  const handleWelfareEnrollmentSelect = (enrollmentId) => {
    const selected = nonMemberEnrollments.find(e => e.id === enrollmentId)
    if (selected) {
      form.setFieldsValue({
        welfare_group: selected.id,
        member: undefined,
        month_number: selected.next_pending_month || 1,
        amount: safeParseFloat(selected.monthly_instalment),
      })
    }
  }

  const handleCategoryChange = (val) => {
    setCategory(val)
    form.setFieldsValue({ category: val || undefined })
    if (val === 'welfare_payment') {
      setWelfarePayerType('member')
    }
    autofillFields(val, selectedMember, memberWelfares, memberLoans, memberMasavari)
  }

  // When a member is selected, load their active sub-systems (welfares, loans, masavari)
  const handleMemberChange = async (memberId) => {
    setSelectedMember(memberId)
    setMemberWelfares([])
    setMemberLoans([])
    setMemberMasavari(null)
    form.setFieldsValue({ welfare_group: undefined, loan: undefined, month_number: undefined, amount: undefined })

    if (!memberId) return

    setDetailsLoading(true)
    try {
      const [welfaresRes, loansRes, masavariRes] = await Promise.all([
        membersApi.getMemberChits(memberId),
        membersApi.getMemberLoans(memberId),
        membersApi.getMemberMasavari(memberId),
      ])

      const activeWelfares = (welfaresRes.data.results || welfaresRes.data).filter(w => w.status === 'active' || w.status === 'awarded')
      const activeLoans = (loansRes.data.results || loansRes.data).filter(l => l.status === 'active')
      const masavariData = masavariRes.data

      setMemberWelfares(activeWelfares)
      setMemberLoans(activeLoans)
      setMemberMasavari(masavariData)

      autofillFields(category, memberId, activeWelfares, activeLoans, masavariData)
    } catch (_) {
      message.error('Failed to load member program details.')
    }
    setDetailsLoading(false)
  }

  const handleWelfareGroupSelect = (enrollmentId) => {
    const selected = memberWelfares.find(w => w.id === enrollmentId)
    if (selected) {
      form.setFieldsValue({
        month_number: selected.next_pending_month || undefined,
        amount: safeParseFloat(selected.monthly_instalment),
      })
    }
  }

  const handleLoanSelect = (loanId) => {
    const selected = memberLoans.find(l => l.id === loanId)
    if (selected) {
      form.setFieldsValue({
        month_number: selected.next_pending_instalment || undefined,
        amount: safeParseFloat(selected.emi_amount),
      })
    }
  }

  const handleFormSubmit = async (values) => {
    setSubmitting(true)
    try {
      const payload = {
        ...values,
        entry_type: entryType,
        date: values.date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD')
      }

      await collectionsApi.createDailyEntry(payload)
      message.success('Collection entry recorded successfully.')
      form.resetFields(['amount', 'description', 'welfare_group', 'loan', 'curry', 'participant_id', 'month_number', 'receipt_no'])
      setSelectedMember(null)
      setSelectedCurry(null)
      setCurryParticipants([])
      setMemberWelfares([])
      setMemberLoans([])
      setMemberMasavari(null)
      loadEntries()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to record entry.')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (v) => formatDate(v)
    },
    {
      title: 'Type',
      dataIndex: 'entry_type',
      key: 'entry_type',
      render: (v) => (
        <Tag color={v === 'income' ? 'success' : 'error'} style={{ textTransform: 'uppercase' }}>
          {v}
        </Tag>
      )
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (v) => <Text style={{ textTransform: 'capitalize' }}>{v.replace(/_/g, ' ')}</Text>
    },
    {
      title: 'Member / Description',
      key: 'description',
      render: (_, row) => (
        <div>
          {row.member_name ? (
            <div>
              <Text strong style={{ color: '#2563eb' }}>{row.member_name}</Text>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>({row.member_no})</Text>
            </div>
          ) : null}
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.description}</div>
        </div>
      )
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (v, row) => (
        <Text strong style={{ color: row.entry_type === 'income' ? '#16a34a' : '#dc2626' }}>
          {row.entry_type === 'income' ? '+' : '-'} {formatCurrency(v)}
        </Text>
      )
    },
    {
      title: 'Mode',
      dataIndex: 'payment_mode',
      key: 'payment_mode',
      render: (v) => <Tag color="blue">{v}</Tag>
    },
    {
      title: 'Recorded By',
      dataIndex: 'recorded_by_name',
      key: 'recorded_by_name',
      render: (v) => v || 'System'
    }
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={3} style={{ color: 'var(--color-text-primary)', margin: 0 }}>Daily Collections Log</Title>
          <Text style={{ color: 'var(--color-text-secondary)' }}>Central ledger to manage incoming payments, outgoing expenses, and profit/loss</Text>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <Card bodyStyle={{ padding: 20 }} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <Statistic
                title={<Text style={{ color: '#16a34a', fontWeight: 600 }}>Total Income</Text>}
                value={parseFloat(summary.total_income)}
                prefix="₹"
                valueStyle={{ color: '#16a34a', fontWeight: 700 }}
                formatter={(v) => v.toLocaleString('en-IN')}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bodyStyle={{ padding: 20 }} style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <Statistic
                title={<Text style={{ color: '#dc2626', fontWeight: 600 }}>Total Expenses</Text>}
                value={parseFloat(summary.total_expense)}
                prefix="₹"
                valueStyle={{ color: '#dc2626', fontWeight: 700 }}
                formatter={(v) => v.toLocaleString('en-IN')}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card bodyStyle={{ padding: 20 }} style={{
              background: parseFloat(summary.net_profit_loss) >= 0 ? '#eff6ff' : '#fffbeb',
              border: parseFloat(summary.net_profit_loss) >= 0 ? '1px solid #bfdbfe' : '1px solid #fde68a'
            }}>
              <Statistic
                title={<Text style={{
                  color: parseFloat(summary.net_profit_loss) >= 0 ? '#2563eb' : '#d97706',
                  fontWeight: 600
                }}>Net Profit / Loss</Text>}
                value={parseFloat(summary.net_profit_loss)}
                prefix="₹"
                valueStyle={{
                  color: parseFloat(summary.net_profit_loss) >= 0 ? '#2563eb' : '#d97706',
                  fontWeight: 700
                }}
                formatter={(v) => v.toLocaleString('en-IN')}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          /* --- TAB 1: ADD TRANSACTION --- */
          {
            key: 'entry',
            label: (
              <span>
                <PlusOutlined />
                Add Collection Entry
              </span>
            ),
            children: (
              <Card title="New Collection or Expense Record" style={{ maxWidth: 800, margin: '0 auto' }}>
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleFormSubmit}
                  initialValues={{ date: dayjs(), payment_mode: 'cash' }}
                >
                  <Row gutter={16}>
                    <Col xs={12}>
                      <Form.Item label="Transaction Type" required>
                        <Select value={entryType} onChange={(v) => { setEntryType(v); handleCategoryChange('') }}>
                          <Option value="income">Income (Incoming Cash / Payments)</Option>
                          <Option value="expense">Expense (Outgoing Payments / Cost)</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={12}>
                      <Form.Item label="Date" name="date" rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                      </Form.Item>
                    </Col>
                    <Col xs={24}>
                      <Form.Item label="Category" name="category" rules={[{ required: true }]}>
                        <Select placeholder="Select category" value={category} onChange={handleCategoryChange}>
                          {entryType === 'income' ? (
                            <>
                              <Option value="welfare_payment">Welfare Payment (Record installment paid by member)</Option>
                              <Option value="loan_emi">Loan EMI (Record repayment paid by member)</Option>
                              <Option value="masavari">Masavari / Monthly Fee (Record monthly membership fee)</Option>
                              <Option value="registration_fee">Registration Fee (Membership fee deposit)</Option>
                              <Option value="due">Due (Fines / Membership renewals)</Option>
                              <Option value="other_income">Other Income (Misc)</Option>
                            </>
                          ) : (
                            <>
                              <Option value="salary">Salary Expense</Option>
                              <Option value="rent">Rent Expense</Option>
                              <Option value="current_bill">Current Bill</Option>
                              <Option value="district_counsil">District Council</Option>
                              <Option value="cycle_expense">Cycle Expense</Option>
                              <Option value="printing_stationary">Printing & Stationary</Option>
                              <Option value="office_expense">Office Expense</Option>
                              <Option value="internet">Internet</Option>
                              <Option value="water">Water</Option>
                              <Option value="pothuyokam">Pothuyokam</Option>
                              <Option value="sitting_fees">Sitting Fees</Option>
                              <Option value="misc_expense">Miscellaneous Expense</Option>
                              <Option value="other_expense">Other Expense</Option>
                            </>
                          )}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider style={{ margin: '12px 0 20px' }} />

                  {/* Program selection block for member payments */}
                  {entryType === 'income' && ['welfare_payment', 'loan_emi', 'masavari', 'registration_fee', 'share_capital'].includes(category) && (
                    <div style={{ background: 'var(--color-bg-hover)', padding: '16px 20px', borderRadius: 8, marginBottom: 20, border: '1px solid var(--color-border)' }}>
                      <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Link Payment</Title>
                      
                      {category === 'welfare_payment' && (
                        <div style={{ marginBottom: 16 }}>
                          <Text strong style={{ marginRight: 12 }}>Welfare Subscriber Type:</Text>
                          <Radio.Group value={welfarePayerType} onChange={(e) => handleWelfarePayerTypeChange(e.target.value)}>
                            <Radio value="member">Registered Member</Radio>
                            <Radio value="non_member">Non-Member Subscriber</Radio>
                          </Radio.Group>
                        </div>
                      )}

                      <Row gutter={16}>
                        {category === 'welfare_payment' && welfarePayerType === 'non_member' ? (
                          <Col xs={24} md={24}>
                            <Form.Item
                              label="Select Non-Member Subscriber & Token"
                              name="welfare_group"
                              rules={[{ required: true, message: 'Select subscriber/token' }]}
                            >
                              <Select
                                placeholder="Search non-member subscriber name or token..."
                                loading={nonMembersLoading}
                                onChange={handleWelfareEnrollmentSelect}
                                showSearch
                                filterOption={(input, option) =>
                                  String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                              >
                                {nonMemberEnrollments.map((e) => (
                                  <Option key={e.id} value={e.id}>
                                    {`${e.non_member_name || ''} (Token #${e.ticket_number || ''}) · ${e.group_name || ''} (${e.group_no || ''})`}
                                  </Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        ) : (
                          <>
                            <Col xs={24} md={12}>
                              <Form.Item
                                label="Select Member"
                                name="member"
                                rules={[{ required: true, message: 'Select member to update' }]}
                              >
                                <Select
                                  showSearch
                                  loading={membersLoading}
                                  filterOption={false}
                                  onSearch={loadMembersForSelect}
                                  onFocus={() => members.length === 0 && loadMembersForSelect('')}
                                  onChange={handleMemberChange}
                                  placeholder="Type name or number to search..."
                                >
                                  {members.map((m) => (
                                    <Option key={m.id} value={m.id}>
                                      {m.full_name} ({m.member_no})
                                    </Option>
                                  ))}
                                </Select>
                              </Form.Item>
                            </Col>

                            {category === 'welfare_payment' && (
                              <Col xs={24} md={12}>
                                <Form.Item
                                  label="Select Welfare Group / Token"
                                  name="welfare_group"
                                  rules={[{ required: true, message: 'Select welfare group' }]}
                                >
                                  <Select placeholder="Select welfare" loading={detailsLoading} onChange={handleWelfareGroupSelect}>
                                    {memberWelfares.map((w) => (
                                      <Option key={w.id} value={w.id}>
                                        {w.group_name} ({w.group_no}) · Token #{w.ticket_number}
                                      </Option>
                                    ))}
                                  </Select>
                                </Form.Item>
                              </Col>
                            )}
                          </>
                        )}

                        {category === 'loan_emi' && (
                          <Col xs={24} md={12}>
                            <Form.Item
                              label="Select Active Loan"
                              name="loan"
                              rules={[{ required: true, message: 'Select loan' }]}
                            >
                               <Select placeholder="Select loan" loading={detailsLoading} onChange={handleLoanSelect}>
                                 {memberLoans.map((l) => (
                                   <Option key={l.id} value={l.id}>
                                     {l.loan_no} ({l.loan_type}) · Outstanding: ₹{l.outstanding_balance}
                                   </Option>
                                 ))}
                               </Select>
                            </Form.Item>
                          </Col>
                        )}

                        {['welfare_payment', 'loan_emi', 'masavari'].includes(category) && (
                          <Col xs={12}>
                            <Form.Item
                              label="Month / Instalment Number"
                              name="month_number"
                              rules={[{ required: true, message: 'Enter number' }]}
                            >
                              <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 1" />
                            </Form.Item>
                          </Col>
                        )}
                      </Row>
                    </div>
                  )}

                  <Row gutter={16}>
                    <Col xs={12}>
                      <Form.Item label="Amount (₹)" name="amount" rules={[{ required: true, message: 'Enter amount' }]}>
                        <InputNumber min={0} style={{ width: '100%' }} prefix="₹" placeholder="0.00" />
                      </Form.Item>
                    </Col>
                    <Col xs={12}>
                      <Form.Item label="Payment Mode" name="payment_mode" rules={[{ required: true }]}>
                        <Select>
                          <Option value="cash">Cash</Option>
                          <Option value="bank_transfer">Bank Transfer</Option>
                          <Option value="upi">UPI</Option>
                          <Option value="cheque">Cheque</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24}>
                      <Form.Item label="Receipt / Voucher No (optional)" name="receipt_no">
                        <Input placeholder="Receipt number or transaction ref" />
                      </Form.Item>
                    </Col>
                    <Col xs={24}>
                      <Form.Item label="Description" name="description" rules={[{ required: true, message: 'Enter description' }]}>
                        <TextArea rows={2} placeholder="Voucher description, details, or notes..." />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item style={{ marginTop: 16 }}>
                    <Button type="primary" htmlType="submit" loading={submitting} disabled={!canWrite} style={{ width: '100%' }}>
                      Record Entry
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            )
          },
          /* --- TAB 2: HISTORY LIST --- */
          {
            key: 'history',
            label: (
              <span>
                <UnorderedListOutlined />
                Transaction History
              </span>
            ),
            children: (
              <div>
                <Card style={{ marginBottom: 16 }}>
                  <Space wrap size={16}>
                    <Text strong>Filter by:</Text>
                    <Select value={period} onChange={setPeriod} style={{ width: 120 }}>
                      <Option value="daily">Daily</Option>
                      <Option value="monthly">Monthly</Option>
                      <Option value="yearly">Yearly</Option>
                    </Select>
                    {period === 'daily' && (
                      <DatePicker value={filterDate} onChange={(d) => d && setFilterDate(d)} format="DD/MM/YYYY" allowClear={false} />
                    )}
                    {period === 'monthly' && (
                      <DatePicker picker="month" value={filterMonth} onChange={(m) => m && setFilterMonth(m)} format="MMM YYYY" allowClear={false} />
                    )}
                    {period === 'yearly' && (
                      <DatePicker picker="year" value={filterMonth} onChange={(y) => y && setFilterMonth(y)} format="YYYY" allowClear={false} />
                    )}
                    <Button type="primary" icon={<SearchOutlined />} onClick={loadEntries}>
                      Search
                    </Button>
                  </Space>
                </Card>

                <Table
                  dataSource={entries}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: true }}
                />
              </div>
            )
          },
          /* --- TAB 3: BREAKDOWN & SUMMARY --- */
          {
            key: 'breakdown',
            label: (
              <span>
                <BarChartOutlined />
                P&L Breakdown
              </span>
            ),
            children: (
              <div>
                <Card title="Category Summary Breakdown" loading={loading}>
                  <Table
                    dataSource={summary?.categories || []}
                    rowKey="category"
                    pagination={false}
                    columns={[
                      {
                        title: 'Category',
                        dataIndex: 'category',
                        render: (v) => <Text strong style={{ textTransform: 'capitalize' }}>{v.replace(/_/g, ' ')}</Text>
                      },
                      {
                        title: 'Flow Type',
                        dataIndex: 'entry_type',
                        render: (v) => (
                          <Tag color={v === 'income' ? 'success' : 'error'} style={{ textTransform: 'uppercase' }}>
                            {v}
                          </Tag>
                        )
                      },
                      {
                        title: 'Total Sum',
                        dataIndex: 'total',
                        render: (v, row) => (
                          <Text strong style={{ color: row.entry_type === 'income' ? '#16a34a' : '#dc2626' }}>
                            {formatCurrency(v)}
                          </Text>
                        )
                      }
                    ]}
                  />
                </Card>
              </div>
            )
          }
        ]}
      />
    </div>
  )
}

export default CollectionsPage
