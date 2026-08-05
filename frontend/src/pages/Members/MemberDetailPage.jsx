import { useEffect, useState } from 'react'
import {
  Tabs, Button, Typography, Space, Card, Row, Col, Statistic, Table, Tag,
  Modal, Form, Input, Select, DatePicker, InputNumber, Descriptions, message,
  Skeleton, Alert, Divider, Badge, Tooltip, Popconfirm,
} from 'antd'
import {
  EditOutlined, UserAddOutlined, PlusOutlined, PrinterOutlined,
  ArrowLeftOutlined, DollarOutlined, CheckCircleOutlined, WarningOutlined,
  DeleteOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import dayjs from 'dayjs'
import {
  fetchMember, fetchMemberSummary, selectCurrentMember,
  selectMemberSummary, selectMemberDetailLoading,
} from '../../app/slices/membersSlice'
import * as membersApi from '../../api/members'
import * as chitsApi from '../../api/chits'
import * as loansApi from '../../api/loans'
import * as duesApi from '../../api/dues'
import {
  formatCurrency, formatDate, formatDateTime, maskAadhaar, formatPhone, getStatusColor,
} from '../../utils/formatters'
import {
  RELATIONSHIP_OPTIONS, PAYMENT_MODE_OPTIONS, DUE_TYPE_OPTIONS,
} from '../../utils/constants'
import StatusBadge from '../../components/StatusBadge'
import MemberAvatar from '../../components/MemberAvatar'
import OverdueTag from '../../components/OverdueTag'
import ActivityTimeline from '../../components/ActivityTimeline'
import PaymentModal from '../../components/PaymentModal'
import usePermissions from '../../hooks/usePermissions'
import ExportButton from '../../components/ExportButton'
import { exportSingleMember } from '../../api/imports'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

const MemberDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { canWrite, canDelete, canApproveLoan } = usePermissions()

  const member = useSelector(selectCurrentMember)
  const summary = useSelector(selectMemberSummary)
  const loading = useSelector(selectMemberDetailLoading)

  const [activeTab, setActiveTab] = useState('profile')
  const [nominees, setNominees] = useState([])
  const [chits, setChits] = useState([])
  const [loans, setLoans] = useState([])
  const [dues, setDues] = useState([])
  const [duesSummary, setDuesSummary] = useState(null)
  const [guarantorLoans, setGuarantorLoans] = useState([])
  const [guarantorWelfares, setGuarantorWelfares] = useState([])
  const [masavariHistory, setMasavariHistory] = useState([])
  const [masavariPending, setMasavariPending] = useState([])
  const [masavariRate, setMasavariRate] = useState('50.00')
  const [allowances, setAllowances] = useState([])
  const [activities, setActivities] = useState([])
  const [activityPage, setActivityPage] = useState(1)
  const [dueFilter, setDueFilter] = useState('all')
  const [members, setMembers] = useState([])
  const [deletingMember, setDeletingMember] = useState(false)
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)

  const handleDeleteMember = async (hardDelete = false) => {
    setDeletingMember(true)
    try {
      await membersApi.deleteMember(id, { hard_delete: hardDelete })
      message.success(hardDelete ? 'Member permanently deleted.' : 'Member deactivated successfully.')
      setDeleteModalVisible(false)
      navigate('/members')
    } catch (err) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message)
      } else {
        message.error('Failed to delete member.')
      }
    } finally {
      setDeletingMember(false)
    }
  }

  // Modals
  const [nomineeModal, setNomineeModal] = useState({ open: false, editData: null })
  const [allowanceModal, setAllowanceModal] = useState(false)
  const [paymentModal, setPaymentModal] = useState({ open: false, enrollment: null, payment: null })
  const [loanRepayModal, setLoanRepayModal] = useState({ open: false, loan: null, repayment: null })
  const [enrollModal, setEnrollModal] = useState(false)
  const [loanApplyModal, setLoanApplyModal] = useState(false)
  const [closeLoanModal, setCloseLoanModal] = useState({ open: false, loan: null })
  const [clearDuesModal, setClearDuesModal] = useState(false)
  const [clearMasavariModal, setClearMasavariModal] = useState(false)
  const [singleMasavariModal, setSingleMasavariModal] = useState({ open: false, record: null })
  
  const [welfareGroups, setWelfareGroups] = useState([])
  const [nomineeForm] = Form.useForm()
  const [depositForm] = Form.useForm()
  const [enrollForm] = Form.useForm()
  const [loanApplyForm] = Form.useForm()
  const [allowanceForm] = Form.useForm()
  const [closeLoanForm] = Form.useForm()
  const [clearDuesForm] = Form.useForm()
  const [clearMasavariForm] = Form.useForm()
  const [singleMasavariForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const memberIdInt = parseInt(id)
  const loanGuarantor = Form.useWatch('guarantor', loanApplyForm)
  const loanGuarantor2 = Form.useWatch('guarantor2', loanApplyForm)

  const loadMembers = async (search = '') => {
    try {
      const res = await membersApi.getMembers({ search, status: 'active', page_size: 100 })
      setMembers(res.data.results || res.data)
    } catch (_) {}
  }

  const loadNominees = async () => {
    try {
      const res = await membersApi.getNominees(id)
      setNominees(res.data.results || res.data)
    } catch (_) {}
  }

  useEffect(() => {
    dispatch(fetchMember(id))
    dispatch(fetchMemberSummary(id))
    loadNominees()
  }, [id, dispatch])

  // Load tab data on demand
  useEffect(() => {
    if (activeTab === 'nominees') loadNominees()
    if (activeTab === 'chits') loadChits()
    if (activeTab === 'loans') loadLoans()
    if (activeTab === 'dues') loadDuesAndGuarantor()
    if (activeTab === 'masavari') loadMasavari()
    if (activeTab === 'allowances') loadAllowances()
    if (activeTab === 'activities') loadActivities()
  }, [activeTab, id])
  const loadChits = async () => {
    try {
      const res = await membersApi.getMemberChits(id)
      setChits(res.data.results || res.data)
    } catch (_) {}
  }
  const loadLoans = async () => {
    try {
      const res = await membersApi.getMemberLoans(id)
      setLoans(res.data.results || res.data)
    } catch (_) {}
  }
  const loadDuesAndGuarantor = async () => {
    try {
      const [dRes, gRes, wRes] = await Promise.all([
        membersApi.getMemberDues(id),
        membersApi.getMemberGuarantorLoans(id),
        membersApi.getMemberGuarantorWelfare(id),
      ])
      setDues(dRes.data.history || [])
      setDuesSummary(dRes.data.summary || null)
      setGuarantorLoans(gRes.data.results || gRes.data)
      setGuarantorWelfares(wRes.data.results || wRes.data)
    } catch (_) {}
  }
  const loadMasavari = async () => {
    try {
      const res = await membersApi.getMemberMasavari(id)
      setMasavariHistory(res.data.history || [])
      setMasavariPending(res.data.pending || [])
      setMasavariRate(res.data.default_amount || '50.00')
    } catch (_) {}
  }
  const loadAllowances = async () => {
    try {
      const res = await membersApi.getMemberAllowances(id)
      setAllowances(res.data.results || res.data)
    } catch (_) {}
  }
  const loadActivities = async () => {
    try {
      const res = await membersApi.getMemberActivities(id, { page: activityPage })
      setActivities(res.data.results || res.data)
    } catch (_) {}
  }

  const loadWelfareGroups = async () => {
    try {
      const res = await chitsApi.getChitGroups({ status: 'active' })
      setWelfareGroups(res.data.results || res.data)
    } catch (_) {}
  }

  const handleSaveNominee = async () => {
    setSubmitting(true)
    try {
      const values = await nomineeForm.validateFields()
      if (nomineeModal.editData) {
        await membersApi.updateNominee(id, nomineeModal.editData.id, values)
        message.success('Nominee updated.')
      } else {
        await membersApi.createNominee(id, values)
        message.success('Nominee added.')
      }
      setNomineeModal({ open: false, editData: null })
      nomineeForm.resetFields()
      loadNominees()
    } catch (err) {
      if (err?.response?.data?.message) message.error(err.response.data.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteNominee = async (nomineeId) => {
    try {
      await membersApi.deleteNominee(id, nomineeId)
      message.success('Nominee removed.')
      loadNominees()
    } catch (_) { message.error('Failed to remove nominee.') }
  }

  const handleChitPayment = async (paymentData) => {
    setSubmitting(true)
    try {
      const payload = {
        ...paymentData,
        month_number: paymentModal.payment.month_number,
      }
      await chitsApi.recordPayment(paymentModal.payment.enrollment, payload)
      message.success('Payment recorded successfully.')
      setPaymentModal({ open: false, enrollment: null, payment: null })
      loadChits()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Payment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEnrollWelfare = async () => {
    setSubmitting(true)
    try {
      const values = await enrollForm.validateFields()
      await chitsApi.enrollMember(values.group_id, {
        member: parseInt(id),
        ticket_number: values.ticket_number,
        enrollment_date: values.enrollment_date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      })
      message.success('Enrolled in Welfare Scheme!')
      setEnrollModal(false)
      enrollForm.resetFields()
      loadChits()
      dispatch(fetchMemberSummary(id))
    } catch (err) {
      if (err?.response?.data?.message) message.error(err.response.data.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleApplyLoan = async () => {
    setSubmitting(true)
    try {
      const values = await loanApplyForm.validateFields()
      await loansApi.createLoan({
        ...values,
        member: parseInt(id),
        disbursement_date: values.disbursement_date?.format('YYYY-MM-DD'),
      })
      message.success('Loan application submitted.')
      setLoanApplyModal(false)
      loanApplyForm.resetFields()
      loadLoans()
      dispatch(fetchMemberSummary(id))
    } catch (err) {
      if (err?.response?.data?.message) message.error(err.response.data.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRecordAllowance = async () => {
    setSubmitting(true)
    try {
      const values = await allowanceForm.validateFields()
      await membersApi.createMemberAllowance(id, {
        ...values,
        paid_date: values.paid_date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      })
      message.success('Allowance recorded successfully!')
      setAllowanceModal(false)
      allowanceForm.resetFields()
      loadAllowances()
      dispatch(fetchMemberSummary(id))
    } catch (err) {
      if (err?.response?.data?.message) message.error(err.response.data.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClearAllDuesSubmit = async () => {
    setSubmitting(true)
    try {
      const values = await clearDuesForm.validateFields()
      await membersApi.clearMemberDues(id, values)
      message.success('All dues successfully cleared and member status updated!')
      setClearDuesModal(false)
      clearDuesForm.resetFields()
      loadDuesAndGuarantor()
      loadMasavari()
      dispatch(fetchMember(id))
      dispatch(fetchMemberSummary(id))
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to clear dues.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = (loan) => {
    setCloseLoanModal({ open: true, loan })
  }

  const handleCloseLoanSubmit = async () => {
    setSubmitting(true)
    try {
      const values = await closeLoanForm.validateFields()
      const res = await loansApi.closeLoan(closeLoanModal.loan.id, values)
      message.success(res.data.message || 'Loan closed and outstanding balance cleared successfully.')
      setCloseLoanModal({ open: false, loan: null })
      closeLoanForm.resetFields()
      loadLoans()
      dispatch(fetchMemberSummary(id))
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to close loan.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClearMasavariSubmit = async () => {
    setSubmitting(true)
    try {
      const values = await clearMasavariForm.validateFields()
      const payload = {
        ...values,
        clear_till: values.clear_till ? values.clear_till.startOf('month').format('YYYY-MM-DD') : null,
      }
      await membersApi.clearMemberMasavari(id, payload)
      message.success('Masavari payments cleared successfully!')
      setClearMasavariModal(false)
      clearMasavariForm.resetFields()
      loadMasavari()
      loadDuesAndGuarantor()
      dispatch(fetchMember(id))
      dispatch(fetchMemberSummary(id))
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to clear Masavari.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSingleMasavariSubmit = async () => {
    setSubmitting(true)
    try {
      const values = await singleMasavariForm.validateFields()
      await duesApi.createMasavari({
        member: parseInt(id),
        month: singleMasavariModal.record.month,
        year: singleMasavariModal.record.year,
        amount: parseFloat(values.amount || singleMasavariModal.record.amount),
        status: 'paid',
        due_date: singleMasavariModal.record.due_date,
        paid_date: values.paid_date ? values.paid_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        payment_mode: values.payment_mode,
        receipt_no: values.receipt_no || '',
        remarks: values.remarks || '',
      })
      message.success('Masavari payment recorded successfully!')
      setSingleMasavariModal({ open: false, record: null })
      singleMasavariForm.resetFields()
      loadMasavari()
      loadDuesAndGuarantor()
      dispatch(fetchMember(id))
      dispatch(fetchMemberSummary(id))
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to record Masavari.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleWelfareGroupChange = (groupId) => {
    const selectedGroup = welfareGroups.find(g => g.id === groupId)
    if (selectedGroup && selectedGroup.suggested_ticket_number) {
      enrollForm.setFieldsValue({ ticket_number: selectedGroup.suggested_ticket_number.toString() })
    }
  }

  const handleLoanRepayment = async (paymentData) => {
    setSubmitting(true)
    try {
      const payload = {
        ...paymentData,
        instalment_no: loanRepayModal.repayment.instalment_no,
      }
      await loansApi.recordRepayment(loanRepayModal.loan.id, payload)
      message.success('Repayment recorded.')
      setLoanRepayModal({ open: false, loan: null, repayment: null })
      loadLoans()
      dispatch(fetchMemberSummary(id))
    } catch (err) {
      message.error(err?.response?.data?.message || 'Repayment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkDuePaid = async (dueId) => {
    try {
      await duesApi.markDuePaid(dueId)
      message.success('Due marked as paid.')
      loadDuesAndGuarantor()
      dispatch(fetchMemberSummary(id))
    } catch (_) { message.error('Failed to mark due.') }
  }

  if (loading && !member) {
    return (
      <div>
        <Skeleton active avatar paragraph={{ rows: 4 }} />
      </div>
    )
  }

  if (!member) {
    return (
      <Alert
        message="Member not found"
        description="The requested member does not exist."
        type="error"
        action={<Button onClick={() => navigate('/members')}>Back to Members</Button>}
      />
    )
  }

  // ============================
  // TABS CONTENT
  // ============================

  const profileTab = (
    <Row gutter={[24, 16]}>
      <Col xs={24} md={12}>
        <Card title="Personal Information" size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Full Name">{member.full_name}</Descriptions.Item>
            {member.full_name_ml && (
              <Descriptions.Item label="Malayalam Name">
                <span style={{ fontFamily: 'Noto Sans Malayalam' }}>{member.full_name_ml}</span>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Date of Birth">{formatDate(member.date_of_birth)}</Descriptions.Item>
            <Descriptions.Item label="Age">{member.age ? `${member.age} years` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Gender">{member.gender === 'M' ? 'Male' : member.gender === 'F' ? 'Female' : 'Other'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{formatPhone(member.phone)}</Descriptions.Item>
            <Descriptions.Item label="Alternate Phone">{formatPhone(member.alternate_phone)}</Descriptions.Item>
            <Descriptions.Item label="Email">{member.email || '—'}</Descriptions.Item>
            {member.business_name && (
              <Descriptions.Item label="Business / Shop">{member.business_name}</Descriptions.Item>
            )}
            {member.business_address && (
              <Descriptions.Item label="Business Address">{member.business_address}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>
        <Card title="Nominee Information" size="small" style={{ marginTop: 16 }}>
          {nominees && nominees.length > 0 ? (
            <div>
              {nominees.map((nom, idx) => (
                <div key={nom.id} style={{ marginBottom: idx < nominees.length - 1 ? 16 : 0 }}>
                  <Descriptions column={1} size="small" title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        Nominee {idx + 1} {nom.is_primary && <Tag color="green" style={{ marginLeft: 8 }}>Primary</Tag>}
                      </span>
                    </div>
                  }>
                    <Descriptions.Item label="Name">{nom.name}</Descriptions.Item>
                    <Descriptions.Item label="Relationship">{nom.relationship_display || nom.relationship}</Descriptions.Item>
                    <Descriptions.Item label="Phone">{formatPhone(nom.phone) || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Share">{nom.share_percentage}%</Descriptions.Item>
                    {nom.address && <Descriptions.Item label="Address">{nom.address}</Descriptions.Item>}
                  </Descriptions>
                  {idx < nominees.length - 1 && <Divider style={{ margin: '12px 0' }} />}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '8px 0', color: 'var(--color-text-muted)' }}>
              No Nominees registered. <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setActiveTab('nominees')}>Manage Nominees</Button>
            </div>
          )}
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="Address" size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Address">{member.address}</Descriptions.Item>
            <Descriptions.Item label="Ward">{member.ward || '—'}</Descriptions.Item>
            <Descriptions.Item label="Panchayat">{member.panchayat || '—'}</Descriptions.Item>
            <Descriptions.Item label="District">{member.district}</Descriptions.Item>
            <Descriptions.Item label="PIN Code">{member.pin_code || '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="Identity" size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Aadhaar">{maskAadhaar(member.aadhaar_number)}</Descriptions.Item>
            <Descriptions.Item label="PAN">{member.pan_number || '—'}</Descriptions.Item>
            <Descriptions.Item label="Member No">
              <Text strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>{member.member_no}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Membership Type"><StatusBadge status={member.membership_type} /></Descriptions.Item>
            <Descriptions.Item label="Joining Date">{formatDate(member.joining_date)}</Descriptions.Item>
            <Descriptions.Item label="Masavari Monthly Rate">{formatCurrency(member.masavari_amount)}</Descriptions.Item>
            <Descriptions.Item label="Status"><StatusBadge status={member.status} /></Descriptions.Item>
          </Descriptions>
          {member.remarks && (
            <div style={{ marginTop: 12, color: '#9ba3bc', fontSize: 13 }}>
              <Text style={{ color: '#6b7280' }}>Remarks: </Text>{member.remarks}
            </div>
          )}
        </Card>
      </Col>
    </Row>
  )

  const nomineesTab = (
    <div>
      {canWrite && (
        <Button
          type="primary" icon={<PlusOutlined />}
          style={{ marginBottom: 16 }}
          onClick={() => {
            nomineeForm.resetFields()
            setNomineeModal({ open: true, editData: null })
          }}
          id="add-nominee-btn"
        >
          Add Nominee
        </Button>
      )}
      <Row gutter={[12, 12]}>
        {nominees.length === 0 && (
          <Col xs={24}>
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
              No nominees added yet.
            </div>
          </Col>
        )}
        {nominees.map((nom) => (
          <Col key={nom.id} xs={24} sm={12} md={8}>
            <Card size="small" style={{ position: 'relative' }}>
              {nom.is_primary && (
                <Tag color="green" style={{ position: 'absolute', top: 8, right: 8, borderRadius: 20 }}>
                  Primary
                </Tag>
              )}
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{nom.name}</div>
              <Text style={{ color: '#2563eb', fontSize: 12 }}>{nom.relationship_display || nom.relationship}</Text>
              <Divider style={{ margin: '8px 0' }} />
              <Text style={{ color: '#9ba3bc', fontSize: 13, display: 'block' }}>
                Share: {nom.share_percentage}%
              </Text>
              {nom.phone && <Text style={{ color: '#9ba3bc', fontSize: 13, display: 'block' }}>📞 {nom.phone}</Text>}
              {canWrite && (
                <Space style={{ marginTop: 12 }}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => {
                    nomineeForm.setFieldsValue(nom)
                    setNomineeModal({ open: true, editData: nom })
                  }}>Edit</Button>
                  <Button size="small" danger onClick={() => handleDeleteNominee(nom.id)}>Remove</Button>
                </Space>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )

  const chitsTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>Welfare Enrollments</Title>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} size="small" id="enroll-welfare-btn"
            onClick={() => {
              loadWelfareGroups()
              setEnrollModal(true)
            }}>
            Add to Welfare
          </Button>
        )}
      </div>
      {chits.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
          Not enrolled in any welfare fund.
        </div>
      )}
      {chits.map((enrollment) => (
        <Card key={enrollment.id} size="small" style={{ marginBottom: 12 }}>
          <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
            <Col>
              <Text strong style={{ color: '#2563eb' }}>{enrollment.group_name}</Text>
              <Text style={{ color: '#9ba3bc', marginLeft: 8, fontSize: 12 }}>
                {enrollment.group_no} · Ticket #{enrollment.ticket_number}
              </Text>
            </Col>
            <Col>
              <Space>
                <StatusBadge status={enrollment.status} />
                {enrollment.prize_won && <Tag color="gold">🏆 Prize Won</Tag>}
              </Space>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 8 }}>
            <Col><Text style={{ color: '#9ba3bc', fontSize: 12 }}>Monthly: <strong style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(enrollment.monthly_instalment)}</strong></Text></Col>
            <Col><Text style={{ color: '#9ba3bc', fontSize: 12 }}>Paid: <strong style={{ color: '#22c55e' }}>{enrollment.paid_months} months</strong></Text></Col>
            <Col><Text style={{ color: '#9ba3bc', fontSize: 12 }}>Total Paid: <strong style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(enrollment.total_paid_amount)}</strong></Text></Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 8 }}>
            <Col>
              <Text style={{ color: '#9ba3bc', fontSize: 12 }}>
                Guarantor 1: <strong style={{ color: 'var(--color-text-primary)' }}>
                  {enrollment.guarantor1_name || (enrollment.guarantor1_non_member_name ? `${enrollment.guarantor1_non_member_name} (Non-Member)` : '—')}
                </strong>
              </Text>
            </Col>
            <Col>
              <Text style={{ color: '#9ba3bc', fontSize: 12 }}>
                Guarantor 2: <strong style={{ color: 'var(--color-text-primary)' }}>
                  {enrollment.guarantor2_name || (enrollment.guarantor2_non_member_name ? `${enrollment.guarantor2_non_member_name} (Non-Member)` : '—')}
                </strong>
              </Text>
            </Col>
          </Row>
          {enrollment.payments && enrollment.payments.length > 0 && (
            <Table
              dataSource={enrollment.payments}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: true }}
              rowClassName={(row) => row.is_overdue ? 'text-overdue' : ''}
              columns={[
                { title: 'Month', dataIndex: 'month_number', width: 60 },
                { title: 'Due Date', dataIndex: 'due_date', render: (v) => formatDate(v) },
                {
                  title: 'Required / Paid',
                  key: 'amount',
                  render: (_, row) => (
                    <div>
                      <div>{formatCurrency(row.installment_amount)}</div>
                      {parseFloat(row.amount_paid || 0) > 0 && (
                        <div style={{ fontSize: 10, color: '#22c55e' }}>Paid: {formatCurrency(row.amount_paid)}</div>
                      )}
                    </div>
                  )
                },
                { title: 'Paid Date', dataIndex: 'paid_date', render: (v) => v ? formatDate(v) : '—' },
                { title: 'Mode', dataIndex: 'payment_mode', render: (v) => v || '—' },
                { title: 'Receipt', dataIndex: 'receipt_no', render: (v) => v || '—' },
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
                    <Button size="small" type="primary" onClick={() => setPaymentModal({
                      open: true,
                      payment: { ...row, enrollment: enrollment.id },
                      enrollment,
                    })}>
                      Pay
                    </Button>
                  ),
                } : {},
              ].filter((c) => Object.keys(c).length > 0)}
            />
          )}
        </Card>
      ))}
    </div>
  )

  const loansTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>Loan Details</Title>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} size="small" id="apply-loan-btn"
            onClick={() => { loadMembers(); setLoanApplyModal(true) }}>
            Apply for Loan
          </Button>
        )}
      </div>
      {loans.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>No loans on record.</div>
      )}
      {loans.map((loan) => (
        <Card key={loan.id} size="small" style={{ marginBottom: 12 }}>
          <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
            <Col>
              <Text strong style={{ color: '#2563eb' }}>{loan.loan_no}</Text>
              <Text style={{ color: '#9ba3bc', marginLeft: 8, fontSize: 12 }}>
                {loan.loan_type} · {loan.duration_months} months
              </Text>
            </Col>
            <Space>
              <StatusBadge status={loan.status} />
              {canApproveLoan && loan.status === 'active' && (
                <Button size="small" type="primary" danger icon={<CloseCircleOutlined />} onClick={() => handleClose(loan)}>
                  Close
                </Button>
              )}
            </Space>
          </Row>
          <Row gutter={16} style={{ marginBottom: 8 }}>
            <Col><Text style={{ color: '#9ba3bc', fontSize: 12 }}>Amount: <strong style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(loan.loan_amount)}</strong></Text></Col>
            <Col><Text style={{ color: '#9ba3bc', fontSize: 12 }}>Rate: <strong style={{ color: 'var(--color-text-primary)' }}>{loan.interest_rate}% p.a.</strong></Text></Col>
            <Col><Text style={{ color: '#9ba3bc', fontSize: 12 }}>Outstanding: <strong style={{ color: loan.outstanding_balance > 0 ? '#ef4444' : '#22c55e' }}>{formatCurrency(loan.outstanding_balance)}</strong></Text></Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 8 }}>
            <Col><Text style={{ color: '#9ba3bc', fontSize: 12 }}>Compulsory Guarantor: <strong style={{ color: 'var(--color-text-primary)' }}>{loan.guarantor_name || '—'}</strong></Text></Col>
            {loan.guarantor2_name && (
              <Col><Text style={{ color: '#9ba3bc', fontSize: 12 }}>Optional Guarantor: <strong style={{ color: 'var(--color-text-primary)' }}>{loan.guarantor2_name}</strong></Text></Col>
            )}
          </Row>
          {loan.repayments && loan.repayments.length > 0 && (
            <Table
              dataSource={loan.repayments}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: true }}
              rowClassName={(row) => row.is_overdue ? 'text-overdue' : ''}
              columns={[
            { title: 'EMI #', dataIndex: 'instalment_no', width: 50 },
                { title: 'Due Date', dataIndex: 'due_date', render: (v) => formatDate(v) },
                { title: 'Instalment', dataIndex: 'amount_paid', render: (v) => formatCurrency(v) },
                { title: 'Principal', dataIndex: 'principal_paid', render: (v) => formatCurrency(v) },
                { title: 'Svc Charge', dataIndex: 'interest_paid', render: (v) => formatCurrency(v) },
                { title: 'Paid Date', dataIndex: 'paid_date', render: (v) => v ? formatDate(v) : '—' },
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
                    <Button size="small" type="primary" onClick={() => setLoanRepayModal({
                      open: true, loan, repayment: row,
                    })}>
                      Pay
                    </Button>
                  ),
                } : {},
              ].filter((c) => Object.keys(c).length > 0)}
            />
          )}
        </Card>
      ))}
    </div>
  )

  const duesTab = (
    <div>
      {duesSummary && (
        <Card title={<span>Dues Summary</span>} size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={6}>
              <Statistic title={<span style={{ color: '#9ba3bc' }}>Pending Masavari ({duesSummary.masavari_pending_count} months)</span>}
                value={formatCurrency(duesSummary.masavari_pending)} valueStyle={{ color: '#6366f1', fontSize: 18 }} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title={<span style={{ color: '#9ba3bc' }}>Overdue EMIs</span>}
                value={formatCurrency(duesSummary.loans_pending)} valueStyle={{ color: '#8b5cf6', fontSize: 18 }} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title={<span style={{ color: '#9ba3bc' }}>Overdue Welfare</span>}
                value={formatCurrency(duesSummary.welfares_pending)} valueStyle={{ color: '#ef4444', fontSize: 18 }} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title={<span style={{ color: '#9ba3bc' }}>Standard Pending Dues</span>}
                value={formatCurrency(duesSummary.standard_dues_pending)} valueStyle={{ color: '#f59e0b', fontSize: 18 }} />
            </Col>
          </Row>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>
               Total Combined Dues: <span style={{ color: '#ef4444', fontSize: 16, marginLeft: 8 }}>{formatCurrency(duesSummary.total_combined_dues)}</span>
            </Text>
            {canWrite && parseFloat(duesSummary.total_combined_dues) > 0 && (
              <Button type="primary" danger icon={<CheckCircleOutlined />} onClick={() => setClearDuesModal(true)}>
                Clear All Dues
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Dues History */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>Dues History</Title>
        <Select
          value={dueFilter}
          onChange={setDueFilter}
          style={{ width: 140 }}
          size="small"
        >
          <Option value="all">All Dues</Option>
          <Option value="pending">Pending</Option>
          <Option value="paid">Paid</Option>
          <Option value="overdue">Overdue</Option>
        </Select>
      </div>
      <Table
        dataSource={dues.filter(d => {
          if (dueFilter === 'all') return true
          if (dueFilter === 'overdue') return d.is_overdue
          return d.status === dueFilter
        })}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 15 }}
        rowClassName={(row) => row.is_overdue ? 'text-overdue' : ''}
        columns={[
          { title: 'Type', dataIndex: 'due_type', render: (v) => <Tag>{v?.replace(/_/g, ' ')}</Tag> },
          { title: 'Amount', dataIndex: 'amount', render: (v) => <span style={{ fontWeight: 600, color: '#ef4444' }}>{formatCurrency(v)}</span> },
          { title: 'Due Date', dataIndex: 'due_date', render: (v) => formatDate(v) },
          {
            title: 'Status', key: 'status',
            render: (_, row) => row.is_paid
              ? <Tag color="success">Paid</Tag>
              : row.is_overdue
              ? <OverdueTag isOverdue daysOverdue={row.days_overdue} />
              : <Tag color="warning">Pending</Tag>,
          },
          { title: 'Paid Date', dataIndex: 'paid_date', render: (v) => v ? formatDate(v) : '—' },
          canWrite ? {
            title: '', key: 'action',
            render: (_, row) => row.status !== 'paid' && (
              <Button size="small" type="primary" onClick={() => handleMarkDuePaid(row.id)}>
                Mark Paid
              </Button>
            ),
          } : {},
        ].filter((c) => Object.keys(c).length > 0)}
        style={{ marginBottom: 24 }}
      />

      {/* Guarantor For Loans */}
      <Title level={5} style={{ marginBottom: 12 }}>Guarantor For Loans</Title>
      {guarantorLoans.length === 0 ? (
        <div style={{ color: '#6b7280', padding: '12px 0' }}>Not a guarantor for any active loan.</div>
      ) : (
        <Table
          dataSource={guarantorLoans}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            { title: 'Loan No', dataIndex: 'loan_no', render: (v) => <Text style={{ color: '#2563eb', fontFamily: 'monospace', fontWeight: 600 }}>{v}</Text> },
            { title: 'Member', key: 'member', render: (_, row) => <span>{row.member_name} ({row.member_no})</span> },
            { title: 'Amount', dataIndex: 'loan_amount', render: (v) => formatCurrency(v) },
            { title: 'Outstanding', dataIndex: 'outstanding_balance', render: (v) => <Text style={{ color: v > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{formatCurrency(v)}</Text> },
            { title: 'Status', dataIndex: 'status', render: (v) => <StatusBadge status={v} /> },
          ]}
        />
      )}

      <Divider style={{ margin: '24px 0' }} />

      {/* Guarantor For Welfare */}
      <Title level={5} style={{ marginBottom: 12 }}>Guarantor For Welfare (Chits)</Title>
      {guarantorWelfares.length === 0 ? (
        <div style={{ color: '#6b7280', padding: '12px 0' }}>Not a guarantor for any active welfare scheme.</div>
      ) : (
        <Table
          dataSource={guarantorWelfares}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            { title: 'Welfare Scheme', key: 'scheme', render: (_, row) => (
              <div>
                <div style={{ fontWeight: 600 }}>{row.group_name}</div>
                <div style={{ fontSize: 11, color: '#9ba3bc' }}>{row.group_no}</div>
              </div>
            )},
            { title: 'Token / Ticket', dataIndex: 'ticket_number', render: (v) => <Tag color="blue">#{v}</Tag> },
            { title: 'Subscriber', key: 'subscriber', render: (_, row) => (
              <div>
                <div style={{ fontWeight: 600 }}>{row.member_name || row.non_member_name}</div>
                <div style={{ fontSize: 11, color: '#9ba3bc' }}>{row.member_no}</div>
              </div>
            )},
            { title: 'Relationship', key: 'relationship', render: (_, row) => {
              const isG1 = row.guarantor1 === member?.id || row.guarantor1_id === member?.id
              return <Tag color={isG1 ? 'cyan' : 'purple'}>{isG1 ? 'Guarantor 1' : 'Guarantor 2'}</Tag>
            }},
            { title: 'Status', dataIndex: 'status', render: (v) => <StatusBadge status={v} /> },
          ]}
        />
      )}
    </div>
  )

  const allowancesTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>Allowances History</Title>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAllowanceModal(true)}>
            Record Allowance
          </Button>
        )}
      </div>
      {allowances.length === 0 ? (
        <div style={{ color: '#6b7280', padding: '12px 0' }}>No allowances recorded for this member.</div>
      ) : (
        <Table
          dataSource={allowances}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 15 }}
          columns={[
            { title: 'Title/Type', dataIndex: 'title', key: 'title', render: (v) => <strong style={{ color: '#f59e0b' }}>{v}</strong> },
            { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v) => <strong style={{ color: '#10b981' }}>{formatCurrency(v)}</strong> },
            { title: 'Paid Date', dataIndex: 'paid_date', key: 'paid_date', render: (v) => formatDate(v) },
            { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <Tag color={v === 'paid' ? 'success' : 'warning'}>{v}</Tag> },
            { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (v) => v || '—' },
          ]}
        />
      )}
    </div>
  )

  const activitiesTab = (
    <div>
      <ActivityTimeline activities={activities} />
    </div>
  )

  return (
    <div>
      {/* Member header */}
      <div className="member-header">
        <MemberAvatar member={member} size={80} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            <Title level={3} style={{ margin: 0 }}>{member.full_name}</Title>
            <Tag style={{
              background: 'rgba(37,99,235,0.2)', color: '#2563eb',
              border: '1px solid rgba(37,99,235,0.4)', borderRadius: 20, fontFamily: 'monospace',
            }}>
              {member.member_no}
            </Tag>
            <StatusBadge status={member.status} />
          </div>
          {member.full_name_ml && (
            <div style={{ color: '#9ba3bc', fontFamily: 'Noto Sans Malayalam', marginBottom: 4 }}>
              {member.full_name_ml}
            </div>
          )}
          <Space wrap>
            <Text style={{ color: '#9ba3bc', fontSize: 13 }}>📞 {formatPhone(member.phone)}</Text>
            {member.email && <Text style={{ color: '#9ba3bc', fontSize: 13 }}>✉ {member.email}</Text>}
            <Text style={{ color: '#9ba3bc', fontSize: 13 }}>
              📅 Joined {formatDate(member.joining_date)}
            </Text>
          </Space>
        </div>
        <Space wrap>
          {canWrite && (
            <Button icon={<EditOutlined />} onClick={() => navigate(`/members/${id}/edit`)} id="edit-member-btn">
              Edit
            </Button>
          )}
          {canDelete && (
            <Button type="primary" danger icon={<DeleteOutlined />} onClick={() => setDeleteModalVisible(true)} id="delete-member-btn">
              Delete Member
            </Button>
          )}
          <ExportButton exportFn={() => exportSingleMember(id)} filename={`member_${member.member_no}.xlsx`}>
            Export Profile
          </ExportButton>
        </Space>
      </div>

      {/* Summary stats */}
      {summary && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {[
            { title: 'Active Welfares', value: summary.active_chits, color: '#3b82f6' },
            { title: 'Active Loans', value: summary.active_loans, color: '#8b5cf6' },
            { title: 'Outstanding Loans', value: summary.total_loan_outstanding, color: '#ef4444', prefix: '₹', isCurrency: true },
            { title: 'Pending Dues', value: summary.pending_dues, color: '#f59e0b' },
            { title: 'Guarantor For (Loans)', value: summary.guarantor_loans_count || 0, color: '#0d9488' },
            { title: 'Guarantor For (Welfares)', value: summary.guarantor_welfares_count || 0, color: '#0ea5e9' },
          ].map((stat) => (
            <Col key={stat.title} xs={12} sm={8} md={6} lg={4}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <Text style={{ color: '#9ba3bc', fontSize: 11, display: 'block' }}>{stat.title}</Text>
                <Text style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>
                  {stat.isCurrency ? formatCurrency(stat.value, 0) : stat.value}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Tabs */}
      <Card bodyStyle={{ padding: 0 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ padding: '0 16px' }}
          items={[
            { key: 'profile', label: 'Profile', children: <div style={{ padding: '16px 0' }}>{profileTab}</div> },
            { key: 'nominees', label: 'Nominees', children: <div style={{ padding: '16px 0' }}>{nomineesTab}</div> },
            { key: 'chits', label: 'Welfare Details', children: <div style={{ padding: '16px 0' }}>{chitsTab}</div> },
            { key: 'loans', label: 'Loans', children: <div style={{ padding: '16px 0' }}>{loansTab}</div> },
            { key: 'dues', label: 'Dues & Guarantor', children: <div style={{ padding: '16px 0' }}>{duesTab}</div> },
            {
              key: 'masavari',
              label: (
                <span>
                  Masavari{' '}
                  {masavariPending.length > 0 && (
                    <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>
                      {masavariPending.length} due
                    </Tag>
                  )}
                </span>
              ),
              children: (
                <div style={{ padding: '16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Title level={5} style={{ margin: 0 }}>Pending Masavari (Monthly Fee)</Title>
                    {canWrite && masavariPending.length > 0 && (
                      <Button type="primary" danger size="small" onClick={() => setClearMasavariModal(true)}>
                        Clear Pending Masavari
                      </Button>
                    )}
                  </div>
                  {masavariPending.length === 0 ? (
                    <div style={{ color: '#6b7280', padding: '12px 0', marginBottom: 24 }}>No pending Masavari dues. Member is fully paid up to date!</div>
                  ) : (
                    <Table
                      dataSource={masavariPending}
                      rowKey={(row) => `${row.year}-${row.month}`}
                      size="small"
                      pagination={false}
                      rowClassName={(row) => row.is_overdue ? 'text-overdue' : ''}
                      style={{ marginBottom: 24 }}
                      columns={[
                        {
                          title: 'Month / Year', key: 'period',
                          render: (_, row) => (
                            <Tag color="warning" style={{ fontWeight: 600 }}>
                              {row.month_label || `${row.month}/${row.year}`}
                            </Tag>
                          ),
                        },
                        { title: 'Amount', dataIndex: 'amount', render: (v) => <Text style={{ color: '#ef4444', fontWeight: 700 }}>{formatCurrency(v)}</Text> },
                        { title: 'Due Date', dataIndex: 'due_date', render: (v) => formatDate(v) },
                        {
                          title: 'Status', key: 'status',
                          render: (_, row) => row.is_overdue
                            ? <OverdueTag isOverdue daysOverdue={row.days_overdue} />
                            : <Tag color="warning">Pending</Tag>,
                        },
                        canWrite ? {
                          title: 'Action', key: 'action', width: 80,
                          render: (_, row) => (
                            <Button size="small" type="primary" onClick={() => {
                              singleMasavariForm.setFieldsValue({ amount: parseFloat(row.amount) })
                              setSingleMasavariModal({ open: true, record: row })
                            }}>
                              Pay
                            </Button>
                          )
                        } : {}
                      ].filter(c => Object.keys(c).length > 0)}
                    />
                  )}

                  <Title level={5} style={{ marginBottom: 16 }}>Masavari Payment History</Title>
                  {masavariHistory.length === 0 ? (
                    <div style={{ color: '#6b7280', padding: '12px 0' }}>No history recorded.</div>
                  ) : (
                    <Table
                      dataSource={masavariHistory}
                      rowKey="id"
                      size="small"
                      pagination={{ pageSize: 12 }}
                      columns={[
                        {
                          title: 'Month / Year', key: 'period',
                          render: (_, row) => (
                            <Tag color="success" style={{ fontWeight: 600 }}>
                              {row.month_label || `${row.month}/${row.year}`}
                            </Tag>
                          ),
                        },
                        { title: 'Amount', dataIndex: 'amount', render: (v) => <Text style={{ color: '#10b981', fontWeight: 700 }}>{formatCurrency(v)}</Text> },
                        { title: 'Paid Date', dataIndex: 'paid_date', render: (v) => formatDate(v) },
                        { title: 'Mode', dataIndex: 'payment_mode', render: (v) => <Tag>{v}</Tag> },
                        { title: 'Receipt No', dataIndex: 'receipt_no', render: (v) => v || '—' },
                        { title: 'Status', key: 'status', render: () => <Tag color="success">Paid</Tag> }
                      ]}
                    />
                  )}
                </div>
              ),
            },
            { key: 'allowances', label: 'Allowances', children: <div style={{ padding: '16px 0' }}>{allowancesTab}</div> },
            { key: 'activities', label: 'Activity Timeline', children: <div style={{ padding: '16px 0' }}>{activitiesTab}</div> },
          ]}
        />
      </Card>

      {/* Back button */}
      <Button icon={<ArrowLeftOutlined />} style={{ marginTop: 16 }} onClick={() => navigate('/members')}>
        Back to Members
      </Button>

      {/* Nominee Modal */}
      <Modal
        title={nomineeModal.editData ? 'Edit Nominee' : 'Add Nominee'}
        open={nomineeModal.open}
        onCancel={() => { setNomineeModal({ open: false, editData: null }); nomineeForm.resetFields() }}
        onOk={handleSaveNominee}
        confirmLoading={submitting}
        okText={nomineeModal.editData ? 'Save Changes' : 'Add Nominee'}
      >
        <Form form={nomineeForm} layout="vertical">
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Required' }]}>
            <Input id="nominee-name" />
          </Form.Item>
          <Form.Item label="Relationship" name="relationship" rules={[{ required: true }]}>
            <Select id="nominee-relationship">
              {RELATIONSHIP_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="Phone" name="phone">
            <Input id="nominee-phone" maxLength={10} />
          </Form.Item>
          <Form.Item label="Share %" name="share_percentage" initialValue={100}>
            <InputNumber id="nominee-share" min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Is Primary Nominee" name="is_primary" valuePropName="checked" initialValue={false}>
            <Select id="nominee-primary">
              <Option value={true}>Yes</Option>
              <Option value={false}>No</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Address" name="address">
            <TextArea id="nominee-address" rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Welfare Payment Modal */}
      <PaymentModal
        open={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, enrollment: null, payment: null })}
        onSubmit={handleChitPayment}
        loading={submitting}
        title="Record Welfare Payment"
        amount={paymentModal.payment ? (parseFloat(paymentModal.payment.installment_amount || 0) - parseFloat(paymentModal.payment.amount_paid || 0)) : 0}
        monthNumber={paymentModal.payment?.month_number}
      />

      {/* Loan Repayment Modal */}
      <PaymentModal
        open={loanRepayModal.open}
        onClose={() => setLoanRepayModal({ open: false, loan: null, repayment: null })}
        onSubmit={handleLoanRepayment}
        loading={submitting}
        title={`Record Loan Repayment — EMI #${loanRepayModal.repayment?.instalment_no}`}
        amount={loanRepayModal.repayment?.amount_paid}
      />

      {/* Deposit modal removed - registration fees handled separately */}

      {/* Add Welfare Modal */}
      <Modal
        title="Add to Welfare Scheme"
        open={enrollModal}
        onCancel={() => { setEnrollModal(false); enrollForm.resetFields() }}
        onOk={handleEnrollWelfare}
        confirmLoading={submitting}
        okText="Add"
      >
        <Form form={enrollForm} layout="vertical">
          <Form.Item label="Welfare Scheme" name="group_id" rules={[{ required: true }]}>
            <Select id="enroll-group" onChange={handleWelfareGroupChange}>
              {welfareGroups.map((g) => (
                <Option key={g.id} value={g.id}>
                  {g.group_name} ({g.group_no})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Ticket Number" name="ticket_number" rules={[{ required: true }]}>
            <Input id="enroll-ticket" placeholder="e.g. 5" />
          </Form.Item>
          <Form.Item label="Enrollment Date" name="enrollment_date" initialValue={dayjs()}>
            <DatePicker id="enroll-date" style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Apply Loan Modal */}
      <Modal
        title="Apply for Loan"
        open={loanApplyModal}
        onCancel={() => { setLoanApplyModal(false); loanApplyForm.resetFields() }}
        onOk={handleApplyLoan}
        confirmLoading={submitting}
        okText="Submit Application"
      >
        <Form form={loanApplyForm} layout="vertical">
          <Form.Item label="Loan Number" name="loan_no" rules={[{ required: true }]}>
            <Input id="loan-no" placeholder="e.g. LN-2026-001" />
          </Form.Item>
          <Form.Item label="Loan Type" name="loan_type" rules={[{ required: true }]}>
            <Select id="loan-type">
              <Option value="personal">Personal</Option>
              <Option value="business">Business</Option>
              <Option value="emergency">Emergency</Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Loan Amount (₹)" name="loan_amount" rules={[{ required: true }]}>
            <InputNumber id="loan-amount" min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item label="Service Charge (₹)" name="service_charge" rules={[{ required: true }]}
            tooltip="Fixed service charge amount in ₹ (not a percentage)">
            <InputNumber id="loan-service-charge" min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item label="Duration (Months)" name="duration_months" rules={[{ required: true }]}>
            <InputNumber id="loan-duration" min={1} max={360} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="EMI Amount (₹)" name="emi_amount" rules={[{ required: true }]}>
            <InputNumber id="loan-emi" min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item label="Compulsory Guarantor" name="guarantor" rules={[{ required: true, message: 'Compulsory guarantor is required.' }]}>
            <Select id="loan-guarantor" showSearch filterOption={false} onSearch={loadMembers}
              placeholder="Select compulsory guarantor">
              {members.filter(m => m.id != memberIdInt && m.id != loanGuarantor2).map((m) => (
                <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Optional Guarantor" name="guarantor2">
            <Select id="loan-guarantor2" showSearch filterOption={false} onSearch={loadMembers}
              placeholder="Select optional guarantor" allowClear>
              {members.filter(m => m.id != memberIdInt && m.id != loanGuarantor).map((m) => (
                <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Purpose" name="purpose">
            <TextArea id="loan-purpose" rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Record Allowance Modal */}
      <Modal
        title="Record Allowance Paid to Member"
        open={allowanceModal}
        onCancel={() => { setAllowanceModal(false); allowanceForm.resetFields() }}
        onOk={handleRecordAllowance}
        confirmLoading={submitting}
        okText="Record Allowance"
      >
        <Form form={allowanceForm} layout="vertical">
          <Form.Item label="Allowance Title / Type" name="title" rules={[{ required: true, message: 'Please enter a title (e.g. Medical Allowance, Festival Gift)' }]}>
            <Input placeholder="e.g. Festival Gift" />
          </Form.Item>
          <Form.Item label="Amount (₹)" name="amount" rules={[{ required: true, message: 'Please enter the amount' }]}>
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item label="Paid Date" name="paid_date" initialValue={dayjs()} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Status" name="status" initialValue="paid" rules={[{ required: true }]}>
            <Select>
              <Option value="paid">Paid</Option>
              <Option value="approved">Approved (Pending Handover)</Option>
              <Option value="pending">Pending Approval</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Remarks" name="remarks">
            <TextArea rows={2} placeholder="Add any notes here..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Clear Dues Modal */}
      <Modal
        title="Clear All Pending Dues"
        open={clearDuesModal}
        onCancel={() => { setClearDuesModal(false); clearDuesForm.resetFields() }}
        onOk={handleClearAllDuesSubmit}
        confirmLoading={submitting}
        okText="Clear All"
        okType="danger"
      >
        <Form form={clearDuesForm} layout="vertical">
          <Text type="warning" style={{ display: 'block', marginBottom: 16 }}>
            Warning: This action will record full payment for all standard dues, overdue loan EMIs, overdue welfare payments, and pending Masavari payments up to the current date.
          </Text>
          <Form.Item label="Payment Mode" name="payment_mode" initialValue="cash" rules={[{ required: true }]}>
            <Select>
              {PAYMENT_MODE_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="Receipt / Ref No" name="receipt_no">
            <Input placeholder="Optional reference number" />
          </Form.Item>
          <Form.Item label="Remarks" name="remarks" initialValue="Cleared all dues in bulk.">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Clear Masavari Modal */}
      <Modal
        title="Clear Pending Masavari Up To Date"
        open={clearMasavariModal}
        onCancel={() => { setClearMasavariModal(false); clearMasavariForm.resetFields() }}
        onOk={handleClearMasavariSubmit}
        confirmLoading={submitting}
        okText="Clear Masavari"
        okType="danger"
      >
        <Form form={clearMasavariForm} layout="vertical">
          <Text type="warning" style={{ display: 'block', marginBottom: 16 }}>
            This action will record full payment for all pending Masavari payments from the member's joining date up to the selected month.
          </Text>
          <Form.Item label="Clear Till Month" name="clear_till" initialValue={dayjs()} rules={[{ required: true, message: 'Required' }]}>
            <DatePicker picker="month" format="MM/YYYY" style={{ width: '100%' }} disabledDate={(d) => d && d.isAfter(dayjs())} />
          </Form.Item>
          <Form.Item label="Payment Mode" name="payment_mode" initialValue="cash" rules={[{ required: true }]}>
            <Select>
              {PAYMENT_MODE_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="Receipt / Ref No" name="receipt_no">
            <Input placeholder="Optional reference number" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Single Masavari Payment Modal */}
      <Modal
        title={singleMasavariModal.record ? `Record Masavari for ${singleMasavariModal.record.month_label || `${singleMasavariModal.record.month}/${singleMasavariModal.record.year}`}` : 'Record Masavari'}
        open={singleMasavariModal.open}
        onCancel={() => { setSingleMasavariModal({ open: false, record: null }); singleMasavariForm.resetFields() }}
        onOk={handleSingleMasavariSubmit}
        confirmLoading={submitting}
        okText="Record Payment"
      >
        <Form form={singleMasavariForm} layout="vertical">
          <Form.Item label="Amount (₹)" name="amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item label="Paid Date" name="paid_date" initialValue={dayjs()} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Payment Mode" name="payment_mode" initialValue="cash" rules={[{ required: true }]}>
            <Select>
              {PAYMENT_MODE_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="Receipt / Ref No" name="receipt_no">
            <Input placeholder="Optional reference number" />
          </Form.Item>
          <Form.Item label="Remarks" name="remarks">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
      {/* Close & Clear Loan Modal */}
      <Modal
        title="Close Loan & Clear Outstanding Balance"
        open={closeLoanModal.open}
        onCancel={() => { setCloseLoanModal({ open: false, loan: null }); closeLoanForm.resetFields() }}
        onOk={handleCloseLoanSubmit}
        confirmLoading={submitting}
        okText="Confirm & Close Loan"
        okType="danger"
      >
        <Form form={closeLoanForm} layout="vertical">
          <div style={{ marginBottom: 16, background: '#1e293b', padding: 12, borderRadius: 6, border: '1px solid #334155' }}>
            <div style={{ fontSize: 13, color: '#9ba3bc' }}>Total Amount Left (Outstanding):</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
              {closeLoanModal.loan && formatCurrency(closeLoanModal.loan.outstanding_balance)}
            </div>
          </div>
          {closeLoanModal.loan && parseFloat(closeLoanModal.loan.outstanding_balance) > 0 ? (
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

      {/* Delete / Deactivate Member Modal */}
      <Modal
        title={<span style={{ color: '#ef4444' }}>⚠️ Delete / Deactivate Member</span>}
        open={deleteModalVisible}
        onCancel={() => setDeleteModalVisible(false)}
        footer={null}
        width={500}
      >
        <div style={{ marginBottom: 20 }}>
          <Text style={{ display: 'block', marginBottom: 12, color: 'var(--color-text-primary)' }}>
            You are about to delete or deactivate member <strong>{member.full_name} ({member.member_no})</strong>.
          </Text>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Please select the deletion type below. To avoid losing details, we recommend deactivating the member.
          </Text>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card size="small" hoverable style={{ border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.05)' }}>
              <div style={{ fontWeight: 600, color: '#3b82f6', marginBottom: 4 }}>Option A: Deactivate Member (Soft Delete)</div>
              <div style={{ fontSize: 12, color: '#9ba3bc', marginBottom: 8 }}>
                Marks the member's status as Inactive. <strong>All history, transactions, loans, and welfare records are preserved.</strong>
              </div>
              <Button type="primary" style={{ background: '#3b82f6', borderColor: '#3b82f6' }} loading={deletingMember} onClick={() => handleDeleteMember(false)}>
                Deactivate Member
              </Button>
            </Card>
            <Card size="small" hoverable style={{ border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.05)' }}>
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Option B: Permanently Delete (Hard Delete)</div>
              <div style={{ fontSize: 12, color: '#9ba3bc', marginBottom: 8 }}>
                Completely erases the member and all of their history from the database. <strong>This action cannot be undone.</strong> Will fail if the member has active financial records.
              </div>
              <Button type="primary" danger loading={deletingMember} onClick={() => handleDeleteMember(true)}>
                Permanently Delete
              </Button>
            </Card>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default MemberDetailPage
