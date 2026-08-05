import { useEffect, useState } from 'react'
import {
  Table, Button, Select, Space, Typography, Tag, Modal, Form, Input, InputNumber,
  DatePicker, Tabs, message, Row, Col, Card, Descriptions,
} from 'antd'
import { PlusOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import * as loansApi from '../../api/loans'
import * as membersApi from '../../api/members'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { LOAN_STATUS_OPTIONS, LOAN_TYPE_OPTIONS, PAYMENT_MODE_OPTIONS } from '../../utils/constants'
import StatusBadge from '../../components/StatusBadge'
import OverdueTag from '../../components/OverdueTag'
import PaymentModal from '../../components/PaymentModal'
import usePermissions from '../../hooks/usePermissions'

const { Title, Text } = Typography
const { Option } = Select

const LoansPage = () => {
  const { canWrite, canApproveLoan } = usePermissions()

  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [overduePayments, setOverduePayments] = useState([])
  const [activeTab, setActiveTab] = useState('loans')
  const [filters, setFilters] = useState({ status: '', loan_type: '' })

  const [loanModal, setLoanModal] = useState(false)
  const [closeLoanModal, setCloseLoanModal] = useState(false)
  const [approveModal, setApproveModal] = useState(false)
  const [approvingLoan, setApprovingLoan] = useState(null)
  const [paymentModal, setPaymentModal] = useState({ open: false, repayment: null })
  const [loanForm] = Form.useForm()
  const [closeLoanForm] = Form.useForm()
  const [approveForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [members, setMembers] = useState([])

  const loanMember = Form.useWatch('member', loanForm)
  const loanGuarantor = Form.useWatch('guarantor', loanForm)
  const loanGuarantor2 = Form.useWatch('guarantor2', loanForm)

  const [editLoanModal, setEditLoanModal] = useState(false)
  const [editingLoan, setEditingLoan] = useState(null)
  const [editLoanForm] = Form.useForm()

  const editLoanMember = Form.useWatch('member', editLoanForm)
  const editLoanGuarantor = Form.useWatch('guarantor', editLoanForm)
  const editLoanGuarantor2 = Form.useWatch('guarantor2', editLoanForm)

  useEffect(() => {
    loadLoans()
    loadOverdue()
  }, [filters])

  const loadLoans = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.status) params.status = filters.status
      if (filters.loan_type) params.loan_type = filters.loan_type
      const res = await loansApi.getLoans(params)
      setLoans(res.data.results || res.data)
    } catch (_) {}
    setLoading(false)
  }

  const loadOverdue = async () => {
    try {
      const res = await loansApi.getOverdueLoans()
      setOverduePayments(res.data.results || res.data)
    } catch (_) {}
  }

  const loadMembersForSelect = async (search = '') => {
    try {
      const res = await membersApi.getMembers({ search, status: 'active' })
      setMembers(res.data.results || res.data)
    } catch (_) {}
  }

  const handleCreateLoan = async () => {
    setSubmitting(true)
    try {
      const values = await loanForm.validateFields()
      await loansApi.createLoan({
        ...values,
        disbursement_date: values.disbursement_date?.format('YYYY-MM-DD'),
      })
      message.success('Loan application created!')
      setLoanModal(false)
      loanForm.resetFields()
      loadLoans()
    } catch (err) {
      if (err?.response?.data?.message) message.error(err.response.data.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openEditLoanModal = (loan) => {
    setEditingLoan(loan)
    editLoanForm.resetFields()
    loadMembersForSelect()
    editLoanForm.setFieldsValue({
      ...loan,
      disbursement_date: loan.disbursement_date ? dayjs(loan.disbursement_date) : null,
    })
    setEditLoanModal(true)
  }

  const handleUpdateLoan = async () => {
    setSubmitting(true)
    try {
      const values = await editLoanForm.validateFields()
      const res = await loansApi.updateLoan(editingLoan.id, {
        ...values,
        disbursement_date: values.disbursement_date ? values.disbursement_date.format('YYYY-MM-DD') : null,
      })
      message.success('Loan updated successfully!')
      setEditLoanModal(false)
      loadLoans()
      if (selectedLoan && selectedLoan.id === editingLoan.id) {
        setSelectedLoan(res.data)
      }
    } catch (err) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message)
      } else {
        message.error('Failed to update loan.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const openApproveModal = (loan) => {
    setApprovingLoan(loan)
    approveForm.setFieldsValue({
      disbursement_date: dayjs(),
      urgent_charge: 0,
    })
    setApproveModal(true)
  }

  const handleApproveSubmit = async () => {
    setSubmitting(true)
    try {
      const values = await approveForm.validateFields()
      await loansApi.approveLoan(approvingLoan.id, {
        disbursement_date: values.disbursement_date?.format('YYYY-MM-DD'),
        urgent_charge: values.urgent_charge || 0,
      })
      message.success('Loan approved and repayment schedule generated!')
      setApproveModal(false)
      loadLoans()
      if (selectedLoan?.id === approvingLoan.id) {
        const res = await loansApi.getLoan(approvingLoan.id)
        setSelectedLoan(res.data)
      }
    } catch (err) {
      message.error(err?.response?.data?.message || 'Approval failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = (loanId) => {
    setCloseLoanModal(true)
  }

  const handleCloseLoanSubmit = async () => {
    setSubmitting(true)
    try {
      const values = await closeLoanForm.validateFields()
      const res = await loansApi.closeLoan(selectedLoan.id, values)
      message.success(res.data.message || 'Loan closed and outstanding balance cleared successfully.')
      setCloseLoanModal(false)
      closeLoanForm.resetFields()
      loadLoans()
      setSelectedLoan(null)
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to close loan.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRepayment = async (data) => {
    setSubmitting(true)
    try {
      await loansApi.recordRepayment(selectedLoan.id, {
        ...data,
        instalment_no: paymentModal.repayment.instalment_no,
      })
      message.success('Repayment recorded!')
      setPaymentModal({ open: false, repayment: null })
      const res = await loansApi.getLoan(selectedLoan.id)
      setSelectedLoan(res.data)
      loadLoans()
      loadOverdue()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Repayment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    { title: 'Loan No', dataIndex: 'loan_no', key: 'loan_no',
      sorter: (a, b) => a.loan_no.localeCompare(b.loan_no),
      render: (v) => <Text style={{ color: '#2563eb', fontWeight: 600, fontFamily: 'monospace' }}>{v}</Text>
    },
    { title: 'Member', key: 'member',
      sorter: (a, b) => a.member_name.localeCompare(b.member_name),
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.member_name}</div>
          <div style={{ fontSize: 11, color: '#9ba3bc' }}>{row.member_no}</div>
        </div>
      )
    },
    { title: 'Type', dataIndex: 'loan_type', render: (v) => <Tag>{v}</Tag> },
    { title: 'Amount', dataIndex: 'loan_amount',
      sorter: (a, b) => parseFloat(a.loan_amount || 0) - parseFloat(b.loan_amount || 0),
      render: (v) => formatCurrency(v)
    },
    { title: 'Svc Charge', dataIndex: 'service_charge', render: (v) => formatCurrency(v || 0) },
    { title: 'Outstanding', dataIndex: 'outstanding_balance',
      sorter: (a, b) => parseFloat(a.outstanding_balance || 0) - parseFloat(b.outstanding_balance || 0),
      render: (v) => <Text style={{ color: v > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{formatCurrency(v)}</Text>
    },
    { title: 'Frequency', dataIndex: 'repayment_frequency', render: (v) => <Tag>{v || 'monthly'}</Tag> },
    { title: 'Status', dataIndex: 'status',
      sorter: (a, b) => a.status.localeCompare(b.status),
      render: (v) => <StatusBadge status={v} />
    },
    {
      title: 'Actions', key: 'actions',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />}
            onClick={() => setSelectedLoan(row)} style={{ color: '#2563eb' }}>
            View
          </Button>
          {canWrite && (
            <Button size="small" icon={<EditOutlined />}
              onClick={() => openEditLoanModal(row)}>
              Edit
            </Button>
          )}
          {canApproveLoan && row.status === 'pending' && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />}
              onClick={() => openApproveModal(row)} id={`approve-loan-${row.id}`}>
              Approve
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const renderLoanDetail = () => {
    if (!selectedLoan) return null
    return (
      <Card
        title={
          <Space>
            <Text style={{ color: 'var(--color-text-primary)' }}>{selectedLoan.loan_no}</Text>
            <StatusBadge status={selectedLoan.status} />
          </Space>
        }
        extra={<Button onClick={() => setSelectedLoan(null)}>← Back</Button>}
        style={{ marginTop: 16 }}
      >
        <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
          {[
            { label: 'Member', value: `${selectedLoan.member_name} (${selectedLoan.member_no})` },
            { label: 'Loan Amount', value: formatCurrency(selectedLoan.loan_amount) },
            { label: 'Service Charge (₹)', value: formatCurrency(selectedLoan.service_charge || 0) },
            { label: 'Repayment', value: selectedLoan.repayment_frequency || 'monthly' },
            { label: 'Duration', value: `${selectedLoan.duration_months} ${selectedLoan.repayment_frequency === 'daily' ? 'days/instalments' : 'months'}` },
            { label: 'EMI Amount', value: formatCurrency(selectedLoan.emi_amount) },
            { label: 'Outstanding', value: formatCurrency(selectedLoan.outstanding_balance) },
            { label: 'Compulsory Guarantor', value: selectedLoan.guarantor_name || '—' },
            { label: 'Optional Guarantor', value: selectedLoan.guarantor2_name || '—' },
            { label: 'Approved By', value: selectedLoan.approved_by_name || '—' },
            { label: 'Purpose', value: selectedLoan.purpose || '—' },
          ].map((item) => (
            <Col key={item.label} xs={12} sm={8}>
              <Text style={{ color: '#9ba3bc', fontSize: 12 }}>{item.label}: </Text>
              <Text style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{item.value}</Text>
            </Col>
          ))}
        </Row>

        {canApproveLoan && selectedLoan.status === 'active' && (
          <Button
            icon={<CloseCircleOutlined />} danger style={{ marginBottom: 12 }}
            onClick={() => handleClose(selectedLoan.id)}
          >
            Close Loan
          </Button>
        )}

        <Title level={5} style={{ marginTop: 8 }}>Repayment Schedule</Title>
        <Table
          dataSource={selectedLoan.repayments || []}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: true }}
          rowClassName={(row) => row.is_overdue ? 'text-overdue' : ''}
          columns={[
            { title: 'EMI #', dataIndex: 'instalment_no', width: 50 },
            { title: 'Due Date', dataIndex: 'due_date', render: (v) => formatDate(v) },
            { title: 'Instalment', dataIndex: 'emi_amount', render: (v) => formatCurrency(v) },
            { title: 'Paid Amount', dataIndex: 'amount_paid', render: (v) => formatCurrency(v) },
            { title: 'Principal', dataIndex: 'principal_paid', render: (v) => formatCurrency(v) },
            { title: 'Service Charge', dataIndex: 'interest_paid', render: (v) => formatCurrency(v) },
            { title: 'Outstanding', dataIndex: 'outstanding_after', render: (v) => formatCurrency(v) },
            { title: 'Paid Date', dataIndex: 'paid_date', render: (v) => v ? formatDate(v) : '—' },
            { title: 'Mode', dataIndex: 'payment_mode' },
            {
              title: 'Status', key: 'status',
              render: (_, row) => row.is_paid
                ? <Tag color="success">Paid</Tag>
                : row.is_overdue
                ? <OverdueTag isOverdue daysOverdue={row.days_overdue} />
                : <Tag color="default">Pending</Tag>,
            },
            canWrite ? {
              title: '', key: 'action', width: 80,
              render: (_, row) => !row.is_paid && (
                <Button size="small" type="primary"
                  onClick={() => setPaymentModal({ open: true, repayment: row })}>
                  Pay
                </Button>
              ),
            } : {},
          ].filter((c) => Object.keys(c).length > 0)}
        />
      </Card>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>Loans</Title>
          <Text style={{ color: '#9ba3bc' }}>{loans.length} loans total</Text>
        </div>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { loanForm.resetFields(); loadMembersForSelect(); setLoanModal(true) }}
            id="add-loan-btn">
            New Loan Application
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <Select placeholder="All Statuses" allowClear style={{ width: 180 }}
          value={filters.status || undefined}
          onChange={(v) => setFilters((f) => ({ ...f, status: v || '' }))}>
          {LOAN_STATUS_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
        </Select>
        <Select placeholder="All Types" allowClear style={{ width: 160 }}
          value={filters.loan_type || undefined}
          onChange={(v) => setFilters((f) => ({ ...f, loan_type: v || '' }))}>
          {LOAN_TYPE_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
        </Select>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'loans',
            label: 'All Loans',
            children: (
              <>
                <Table
                  columns={columns}
                  dataSource={loans}
                  loading={loading}
                  rowKey="id"
                  id="loans-table"
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: true }}
                />
                {selectedLoan && renderLoanDetail()}
              </>
            ),
          },
          {
            key: 'overdue',
            label: `Overdue EMIs ${overduePayments.length > 0 ? `(${overduePayments.length})` : ''}`,
            children: (
              <Table
                dataSource={overduePayments}
                rowKey="id"
                id="loan-overdue-table"
                pagination={{ pageSize: 20 }}
                columns={[
                  { title: 'Loan No', dataIndex: ['loan', 'loan_no'], render: (_, r) => r.loan?.loan_no || '—' },
                  { title: 'Member', dataIndex: ['loan', 'member_name'],
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.loan?.member_name}</div>
                        <div style={{ fontSize: 11, color: '#9ba3bc' }}>{r.loan?.member_no}</div>
                      </div>
                    )
                  },
                  { title: 'EMI #', dataIndex: 'instalment_no' },
                  { title: 'Amount', dataIndex: 'emi_amount', render: (v) => formatCurrency(v) },
                  { title: 'Due Date', dataIndex: 'due_date', render: (v) => formatDate(v) },
                  { title: 'Days Overdue', dataIndex: 'days_overdue', render: (v) => <Tag color="error">{v}d</Tag> },
                ]}
              />
            ),
          },
        ]}
      />

      {/* New Loan Modal */}
      <Modal
        title="New Loan Application"
        open={loanModal}
        onCancel={() => setLoanModal(false)}
        onOk={handleCreateLoan}
        confirmLoading={submitting}
        okText="Submit Application"
        width={620}
      >
        <Form form={loanForm} layout="vertical">
          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item label="Loan Number" name="loan_no" rules={[{ required: true }]}>
                <Input id="loan-no" placeholder="e.g. LN-2026-001" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Member" name="member" rules={[{ required: true }]}>
                <Select
                  id="loan-member-select"
                  showSearch filterOption={false}
                  onSearch={loadMembersForSelect}
                  placeholder="Search member"
                >
                  {members.filter(m => m.id != loanGuarantor && m.id != loanGuarantor2).map((m) => <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Loan Type" name="loan_type" rules={[{ required: true }]} initialValue="personal">
                <Select id="loan-type">
                  {LOAN_TYPE_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Loan Amount (₹)" name="loan_amount" rules={[{ required: true }]}>
                <InputNumber id="loan-amount" min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Service Charge (₹)" name="service_charge" rules={[{ required: true }]}
                tooltip="Fixed service charge amount in ₹ (not a percentage)">
                <InputNumber id="loan-service-charge" min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Repayment Frequency" name="repayment_frequency" initialValue="monthly">
                <Select id="loan-frequency">
                  <Option value="monthly">Monthly</Option>
                  <Option value="daily">Daily</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item
                label={Form.useWatch('repayment_frequency', loanForm) === 'daily' ? 'Duration (Days)' : 'Duration (Months)'}
                name="duration_months"
                rules={[{ required: true }]}
              >
                <InputNumber id="loan-duration" min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="EMI Amount (₹)" name="emi_amount" rules={[{ required: true }]}>
                <InputNumber id="loan-emi" min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Disbursement Date" name="disbursement_date">
                <DatePicker id="loan-disbursement-date" style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Compulsory Guarantor" name="guarantor" rules={[{ required: true, message: 'Compulsory guarantor is required.' }]}>
                <Select id="loan-guarantor" showSearch filterOption={false} onSearch={loadMembersForSelect}
                  placeholder="Select compulsory guarantor">
                  {members.filter(m => m.id != loanMember && m.id != loanGuarantor2).map((m) => (
                    <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Optional Guarantor" name="guarantor2">
                <Select id="loan-guarantor2" showSearch filterOption={false} onSearch={loadMembersForSelect}
                  placeholder="Select optional guarantor" allowClear>
                  {members.filter(m => m.id != loanMember && m.id != loanGuarantor).map((m) => (
                    <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Purpose" name="purpose">
                <Input.TextArea id="loan-purpose" rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Edit Loan Modal */}
      <Modal
        title="Edit Loan Details"
        open={editLoanModal}
        onCancel={() => setEditLoanModal(false)}
        onOk={handleUpdateLoan}
        confirmLoading={submitting}
        okText="Save Changes"
        width={620}
      >
        <Form form={editLoanForm} layout="vertical">
          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item label="Loan Number" name="loan_no" rules={[{ required: true }]}>
                <Input placeholder="e.g. LN-2026-001" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Member" name="member" rules={[{ required: true }]}>
                <Select
                  showSearch filterOption={false}
                  onSearch={loadMembersForSelect}
                  placeholder="Search member"
                  disabled={editingLoan?.status !== 'pending'}
                >
                  {members.filter(m => m.id != editLoanGuarantor && m.id != editLoanGuarantor2).map((m) => (
                    <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Loan Type" name="loan_type" rules={[{ required: true }]}>
                <Select>
                  {LOAN_TYPE_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Loan Amount (₹)" name="loan_amount" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Service Charge (₹)" name="service_charge" rules={[{ required: true }]}
                tooltip="Fixed service charge amount in ₹ (not a percentage)">
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Repayment Frequency" name="repayment_frequency">
                <Select>
                  <Option value="monthly">Monthly</Option>
                  <Option value="daily">Daily</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item
                label={Form.useWatch('repayment_frequency', editLoanForm) === 'daily' ? 'Duration (Days)' : 'Duration (Months)'}
                name="duration_months"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="EMI Amount (₹)" name="emi_amount" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Disbursement Date" name="disbursement_date">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Status" name="status" rules={[{ required: true }]}>
                <Select>
                  {LOAN_STATUS_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Compulsory Guarantor" name="guarantor" rules={[{ required: true, message: 'Compulsory guarantor is required.' }]}>
                <Select showSearch filterOption={false} onSearch={loadMembersForSelect}
                  placeholder="Select compulsory guarantor">
                  {members.filter(m => m.id != editLoanMember && m.id != editLoanGuarantor2).map((m) => (
                    <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Optional Guarantor" name="guarantor2">
                <Select showSearch filterOption={false} onSearch={loadMembersForSelect}
                  placeholder="Select optional guarantor" allowClear>
                  {members.filter(m => m.id != editLoanMember && m.id != editLoanGuarantor).map((m) => (
                    <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Purpose" name="purpose">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Remarks" name="remarks">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Repayment Modal */}
      <PaymentModal
        open={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, repayment: null })}
        onSubmit={handleRepayment}
        loading={submitting}
        title={`Record Loan Repayment — EMI #${paymentModal.repayment?.instalment_no}`}
        amount={paymentModal.repayment?.amount_paid}
      />

      {/* Close & Clear Loan Modal */}
      <Modal
        title="Close Loan & Clear Outstanding Balance"
        open={closeLoanModal}
        onCancel={() => { setCloseLoanModal(false); closeLoanForm.resetFields() }}
        onOk={handleCloseLoanSubmit}
        confirmLoading={submitting}
        okText="Confirm & Close Loan"
        okType="danger"
      >
        <Form form={closeLoanForm} layout="vertical">
          <div style={{ marginBottom: 16, background: '#1e293b', padding: 12, borderRadius: 6, border: '1px solid #334155' }}>
            <div style={{ fontSize: 13, color: '#9ba3bc' }}>Total Amount Left (Outstanding):</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
              {selectedLoan && formatCurrency(selectedLoan.outstanding_balance)}
            </div>
          </div>
          {selectedLoan && parseFloat(selectedLoan.outstanding_balance) > 0 ? (
            <>
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Please enter the final payment details below to clear the remaining balance and close this loan.
              </Text>
              <Form.Item label="Payment Mode" name="payment_mode" initialValue="cash" rules={[{ required: true }]}>
                <Select>
                  {PAYMENT_MODE_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item label="Receipt / Ref No" name="receipt_no">
                <Input placeholder="Receipt or transaction reference number" />
              </Form.Item>
              <Form.Item label="Remarks" name="remarks" initialValue="Final payment to close loan.">
                <Input.TextArea rows={2} />
              </Form.Item>
            </>
          ) : (
            <Text style={{ color: 'var(--color-text-primary)' }}>
              This loan has no outstanding balance. Confirming will close this loan immediately.
            </Text>
          )}
        </Form>
      </Modal>

      {/* Approve Loan Modal */}
      <Modal
        title="Approve Loan Application"
        open={approveModal}
        onCancel={() => { setApproveModal(false); approveForm.resetFields() }}
        onOk={handleApproveSubmit}
        confirmLoading={submitting}
        okText="Approve & Disburse"
        width={450}
        destroyOnClose
      >
        <Form form={approveForm} layout="vertical">
          {approvingLoan && (
            <div style={{ marginBottom: 16, background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                <strong>Loan No:</strong> {approvingLoan.loan_no}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                <strong>Member:</strong> {approvingLoan.member_name} ({approvingLoan.member_no})
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                <strong>Loan Amount:</strong> {formatCurrency(approvingLoan.loan_amount)}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                <strong>Upfront Service Charge:</strong> {formatCurrency(approvingLoan.service_charge)}
              </div>
            </div>
          )}
          <Form.Item label="Disbursement Date" name="disbursement_date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Urgent Payout Charge (₹)" name="urgent_charge" initialValue={0} tooltip="Taken if loan amount is given before the grace period">
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default LoansPage
