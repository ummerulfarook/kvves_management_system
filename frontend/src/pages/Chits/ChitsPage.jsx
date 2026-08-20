import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import {
  Row, Col, Card, Button, Table, Tag, Typography, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Tabs, message, Alert, Divider, Spin, Switch,
} from 'antd'
import { PlusOutlined, EyeOutlined, SafetyOutlined, UserAddOutlined, ArrowLeftOutlined, CoffeeOutlined, EditOutlined, SettingOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import * as chitsApi from '../../api/chits'
import * as membersApi from '../../api/members'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { WELFARE_STATUS_OPTIONS } from '../../utils/constants'
import StatusBadge from '../../components/StatusBadge'
import PaymentModal from '../../components/PaymentModal'
import usePermissions from '../../hooks/usePermissions'
const { Title, Text } = Typography
const getGroupDivisions = (g) => {
  if (!g) return []
  let labels = g.division_labels ? g.division_labels.split(',').map(d => d.trim()).filter(Boolean) : []
  const eff = (!g.number_of_divisions || g.number_of_divisions < 1) ? 1 : g.number_of_divisions
  if (labels.length === 0) {
    labels = ['A']
  }
  while (labels.length < eff) {
    labels.push(String.fromCharCode(65 + labels.length))
  }
  return labels.slice(0, eff)
}

const WelfarePage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { canWrite } = usePermissions()

  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [overduePayments, setOverduePayments] = useState([])
  const [overdueLoading, setOverdueLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('groups')

  // Modals
  const [groupModal, setGroupModal] = useState(false)
  const [enrollModal, setEnrollModal] = useState(false)
  const [drawWinnerModal, setDrawWinnerModal] = useState({ open: false, enrollment: null })
  const [paymentModal, setPaymentModal] = useState({ open: false, payment: null })
  const [groupForm] = Form.useForm()
  const [enrollForm] = Form.useForm()
  const [drawWinnerForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  // Monthly auction states
  const [activeAuction, setActiveAuction] = useState(null)
  const [auctionLoading, setAuctionLoading] = useState(false)
  const [auctionModal, setAuctionModal] = useState(false)
  const [selectedAuctionMonth, setSelectedAuctionMonth] = useState(1)
  const [auctionSlots, setAuctionSlots] = useState([])
  const [auctionsHistory, setAuctionsHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Clear Dues Up To Month states
  const [clearDuesModal, setClearDuesModal] = useState({ open: false, enrollment: null })
  const [clearDuesForm] = Form.useForm()

  // Edit Payout & Service Charge states
  const [editPayoutModal, setEditPayoutModal] = useState(false)
  const [editingEnrollment, setEditingEnrollment] = useState(null)
  const [payoutForm] = Form.useForm()
  const [handoverModal, setHandoverModal] = useState({ open: false, enrollment: null })
  const [handoverForm] = Form.useForm()

  // Edit Member Enrollment states
  const [editMemberModal, setEditMemberModal] = useState(false)
  const [editingMemberEnrollment, setEditingMemberEnrollment] = useState(null)
  const [editMemberForm] = Form.useForm()

  // View Payments states
  const [paymentsModal, setPaymentsModal] = useState(false)
  const [selectedEnrollment, setSelectedEnrollment] = useState(null)
  const [enrollmentPayments, setEnrollmentPayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(false)

  // Edit Welfare Scheme states
  const [editGroupModal, setEditGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [editGroupForm] = Form.useForm()

  // Top-level Form.useWatch calls (Must stay unconditional at top-level of component)
  const watchChitValue = Form.useWatch('chit_value', groupForm)
  const watchDivisions = Form.useWatch('number_of_divisions', groupForm)
  const watchTotalMembers = Form.useWatch('total_members', groupForm)
  const watchDurationMonths = Form.useWatch('duration_months', groupForm)

  const isRegisteredMember = Form.useWatch('is_registered_member', enrollForm)
  const guarantor1Type = Form.useWatch('guarantor1_type', enrollForm)
  const guarantor2Type = Form.useWatch('guarantor2_type', enrollForm)
  const enrollMember = Form.useWatch('member', enrollForm)
  const enrollGuarantor1 = Form.useWatch('guarantor1', enrollForm)
  const enrollGuarantor2 = Form.useWatch('guarantor2', enrollForm)

  const isRegisteredMemberEdit = Form.useWatch('is_registered_member', editMemberForm)
  const guarantor1TypeEdit = Form.useWatch('guarantor1_type', editMemberForm)
  const guarantor2TypeEdit = Form.useWatch('guarantor2_type', editMemberForm)

  const handoverPaymentMode = Form.useWatch('payout_payment_mode', handoverForm)

  const handleViewPayments = async (enrollment) => {
    setSelectedEnrollment(enrollment)
    setPaymentsModal(true)
    setLoadingPayments(true)
    try {
      const res = await chitsApi.getPayments(enrollment.id)
      setEnrollmentPayments(res.data.results || res.data)
    } catch (err) {
      message.error('Failed to load installment payments.')
    } finally {
      setLoadingPayments(false)
    }
  }

  const openEditPayoutModal = (enrollment) => {
    setEditingEnrollment(enrollment)
    setEditPayoutModal(true)
  }

  useEffect(() => {
    if (editPayoutModal && editingEnrollment && selectedGroup) {
      const bidAmount = parseFloat(selectedGroup.chit_value) - parseFloat(editingEnrollment.reduction_amount || 0)
      const serviceCharge = parseFloat(editingEnrollment.service_charge || 0)
      const surchargeAmount = parseFloat(editingEnrollment.surcharge_amount || 0)
      const commission = surchargeAmount - serviceCharge

      payoutForm.setFieldsValue({
        bid_amount: bidAmount,
        commission_amount: commission,
        service_charge: serviceCharge,
        net_received: bidAmount - commission - serviceCharge
      })
    }
  }, [editPayoutModal, editingEnrollment, selectedGroup])

  const handleSavePayout = async () => {
    try {
      const values = await payoutForm.validateFields()
      setSubmitting(true)
      
      const newSurcharge = parseFloat(values.commission_amount || 0) + parseFloat(values.service_charge || 0)
      const newPrizeAmount = parseFloat(values.bid_amount || 0) - newSurcharge

      await chitsApi.patchEnrollment(editingEnrollment.id, {
        service_charge: values.service_charge,
        surcharge_amount: newSurcharge,
        prize_amount: newPrizeAmount
      })

      message.success('Payout details updated successfully!')
      setEditPayoutModal(false)
      if (selectedGroup) {
        loadEnrollments(selectedGroup.id)
        loadAuctionsHistory(selectedGroup.id)
      }
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to update payout details.')
    } finally {
      setSubmitting(false)
    }
  }

  const openHandoverModal = (enrollment) => {
    handoverForm.resetFields()
    handoverForm.setFieldsValue({
      received_date: dayjs(),
      payout_payment_mode: 'cash',
      cheque_number: ''
    })
    setHandoverModal({ open: true, enrollment })
  }

  const handleHandoverSubmit = async () => {
    try {
      const values = await handoverForm.validateFields()
      setSubmitting(true)
      await chitsApi.patchEnrollment(handoverModal.enrollment.id, {
        received_date: values.received_date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
        payout_payment_mode: values.payout_payment_mode,
        cheque_number: values.cheque_number || ''
      })
      message.success('Welfare payout marked as handed over successfully!')
      setHandoverModal({ open: false, enrollment: null })
      if (selectedGroup) {
        loadEnrollments(selectedGroup.id)
        loadAuctionsHistory(selectedGroup.id)
      }
    } catch (err) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.[0] || err?.response?.data?.message || 'Failed to complete handover.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    loadGroups()
    loadOverdue()
  }, [])

  useEffect(() => {
    if (selectedGroup) {
      loadEnrollments(selectedGroup.id)
      loadActiveAuction(selectedGroup.id)
      loadAuctionsHistory(selectedGroup.id)
    } else {
      setEnrollments([])
      setActiveAuction(null)
      setAuctionsHistory([])
    }
  }, [selectedGroup])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const res = await chitsApi.getChitGroups()
      setGroups(res.data.results || res.data)
    } catch (_) {
      message.error('Failed to load welfare schemes.')
    }
    setLoading(false)
  }

  const loadEnrollments = async (groupId) => {
    setEnrollLoading(true)
    try {
      const res = await chitsApi.getEnrollments(groupId)
      setEnrollments(res.data.results || res.data)
    } catch (_) {
      message.error('Failed to load members for this scheme.')
    }
    setEnrollLoading(false)
  }

  const loadActiveAuction = async (groupId) => {
    setAuctionLoading(true)
    try {
      const res = await chitsApi.getActiveAuction(groupId)
      setActiveAuction(res.data)
    } catch (_) {
      message.error('Failed to load active auction.')
    }
    setAuctionLoading(false)
  }

  const loadAuctionsHistory = async (groupId) => {
    setHistoryLoading(true)
    try {
      const res = await chitsApi.getWelfareAuctions(groupId)
      // Handle both paginated ({results: [...]}) and direct array responses
      const data = res.data
      setAuctionsHistory(Array.isArray(data) ? data : (data?.results || []))
    } catch (_) {}
    setHistoryLoading(false)
  }

  const loadOverdue = async () => {
    setOverdueLoading(true)
    try {
      const res = await chitsApi.getOverdueChits()
      setOverduePayments(res.data.results || res.data)
    } catch (_) {
      message.error('Failed to load overdue payments.')
    }
    setOverdueLoading(false)
  }

  const loadMembersForSelect = async (search = '', extraMembers = []) => {
    setMembersLoading(true)
    try {
      const res = await membersApi.getMembers({ search, page_size: 100 })
      const fetched = res.data.results || res.data
      const merged = [...extraMembers]
      const seenIds = new Set(merged.map(m => m.id))
      for (const m of fetched) {
        if (!seenIds.has(m.id)) {
          merged.push(m)
        }
      }
      setMembers(merged)
    } catch (_) {}
    setMembersLoading(false)
  }

  const calculateNextToken = (groupObj, enrollList) => {
    let maxNum = 0
    if (Array.isArray(enrollList)) {
      enrollList.forEach(e => {
        if (e.ticket_number) {
          const nums = String(e.ticket_number).match(/\d+/g)
          if (nums) {
            const val = parseInt(nums[nums.length - 1], 10)
            if (!isNaN(val) && val > maxNum) maxNum = val
          }
        }
      })
    }
    if (maxNum > 0) return maxNum + 1
    return groupObj?.suggested_ticket_number || 1
  }

  const openAddMemberModal = async (group) => {
    if (!group) { message.warning('Please select a welfare scheme first.'); return }
    if (group.enrolled_count >= group.total_members) {
      message.error(`Cannot add member. This welfare scheme has reached its limit of ${group.total_members} members.`);
      return
    }
    setSelectedGroup(group)

    let currentEnrollments = enrollments
    try {
      const res = await chitsApi.getEnrollments(group.id)
      currentEnrollments = res.data.results || res.data
      setEnrollments(currentEnrollments)
    } catch (_) {}

    const nextTicket = calculateNextToken(group, currentEnrollments)

    enrollForm.resetFields()
    enrollForm.setFieldsValue({
      is_registered_member: true,
      ticket_number: nextTicket,
      enrollment_date: dayjs(),
      guarantor1_type: 'none',
      guarantor2_type: 'none',
      initial_paid_months: 0,
    })
    loadMembersForSelect('')
    setEnrollModal(true)
  }

  const handleCreateGroup = async () => {
    setSubmitting(true)
    try {
      const values = await groupForm.validateFields()
      const res = await chitsApi.createChitGroup({
        ...values,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        end_date: values.end_date?.format('YYYY-MM-DD'),
      })
      message.success('Welfare scheme created!')
      setGroupModal(false)
      groupForm.resetFields()
      await loadGroups()
      const newGroup = res.data
      Modal.confirm({
        title: 'Add Members Now?',
        content: `Scheme "${newGroup.group_name}" created. Would you like to add members now?`,
        okText: 'Yes, Add Members',
        cancelText: 'Later',
        icon: <UserAddOutlined style={{ color: '#2563eb' }} />,
        onOk: () => openAddMemberModal(newGroup),
      })
    } catch (err) {
      if (err?.errorFields) return
      const data = err?.response?.data
      const msg = data?.message || data?.group_no?.[0] || 'Failed to create scheme.'
      message.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEnrollMember = async () => {
    if (!selectedGroup) { message.error('No welfare scheme selected.'); return }
    setSubmitting(true)
    try {
      const values = await enrollForm.validateFields()
      const payload = {
        division_label: values.division_label,
        enrollment_date: values.enrollment_date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
        initial_paid_months: values.initial_paid_months || 0,
      }
      if (values.ticket_number) {
        payload.ticket_number = String(values.ticket_number)
      }
      if (values.is_registered_member !== false) {
        payload.member = values.member
      } else {
        payload.non_member_name = values.non_member_name
        payload.non_member_phone = values.non_member_phone
        payload.non_member_address = values.non_member_address
      }

      // Guarantor 1
      if (values.guarantor1_type === 'member') {
        payload.guarantor1 = values.guarantor1
        payload.guarantor1_non_member_name = ''
        payload.guarantor1_non_member_phone = ''
      } else if (values.guarantor1_type === 'non_member') {
        payload.guarantor1 = null
        payload.guarantor1_non_member_name = values.guarantor1_non_member_name
        payload.guarantor1_non_member_phone = values.guarantor1_non_member_phone
      } else {
        payload.guarantor1 = null
        payload.guarantor1_non_member_name = ''
        payload.guarantor1_non_member_phone = ''
      }

      // Guarantor 2
      if (values.guarantor2_type === 'member') {
        payload.guarantor2 = values.guarantor2
        payload.guarantor2_non_member_name = ''
        payload.guarantor2_non_member_phone = ''
      } else if (values.guarantor2_type === 'non_member') {
        payload.guarantor2 = null
        payload.guarantor2_non_member_name = values.guarantor2_non_member_name
        payload.guarantor2_non_member_phone = values.guarantor2_non_member_phone
      } else {
        payload.guarantor2 = null
        payload.guarantor2_non_member_name = ''
        payload.guarantor2_non_member_phone = ''
      }

      await chitsApi.enrollMember(selectedGroup.id, payload)
      message.success(`Member added to ${selectedGroup.group_name}!`)
      setEnrollModal(false)
      enrollForm.resetFields()

      // Refresh enrollments & selectedGroup state immediately
      const freshEnrollRes = await chitsApi.getEnrollments(selectedGroup.id)
      const freshList = freshEnrollRes.data.results || freshEnrollRes.data
      setEnrollments(freshList)

      const freshGroupRes = await chitsApi.getChitGroup(selectedGroup.id)
      setSelectedGroup(freshGroupRes.data)
      loadGroups()
    } catch (err) {
      const data = err?.response?.data
      if (data) {
        const msg =
          data.message ||
          data.non_field_errors?.[0] ||
          data.ticket_number?.[0] ||
          data.member?.[0] ||
          data.non_member_name?.[0] ||
          data.guarantor1?.[0] ||
          data.guarantor2?.[0] ||
          data.enrollment_date?.[0] ||
          JSON.stringify(data)
        message.error(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const openEditMemberModal = (enrollment) => {
    setEditingMemberEnrollment(enrollment)
    editMemberForm.resetFields()
    editMemberForm.setFieldsValue({
      enrollment_date: enrollment.enrollment_date ? dayjs(enrollment.enrollment_date) : dayjs(),
      ticket_number: enrollment.ticket_number,
      division_label: enrollment.division_label,
      is_registered_member: !!enrollment.member,
      member: enrollment.member,
      non_member_name: enrollment.non_member_name,
      non_member_phone: enrollment.non_member_phone,
      non_member_address: enrollment.non_member_address,
      guarantor1_type: enrollment.guarantor1 ? 'member' : (enrollment.guarantor1_non_member_name ? 'non_member' : 'none'),
      guarantor1: enrollment.guarantor1,
      guarantor1_non_member_name: enrollment.guarantor1_non_member_name,
      guarantor1_non_member_phone: enrollment.guarantor1_non_member_phone,
      guarantor2_type: enrollment.guarantor2 ? 'member' : (enrollment.guarantor2_non_member_name ? 'non_member' : 'none'),
      guarantor2: enrollment.guarantor2,
      guarantor2_non_member_name: enrollment.guarantor2_non_member_name,
      guarantor2_non_member_phone: enrollment.guarantor2_non_member_phone,
      status: enrollment.status,
      remarks: enrollment.remarks,
    })
    const extras = []
    if (enrollment.member) {
      extras.push({
        id: enrollment.member,
        full_name: enrollment.member_name,
        member_no: enrollment.member_no,
      })
    }
    if (enrollment.guarantor1 && enrollment.guarantor1_name) {
      extras.push({
        id: enrollment.guarantor1,
        full_name: enrollment.guarantor1_name,
        member_no: enrollment.guarantor1_member_no || '',
      })
    }
    if (enrollment.guarantor2 && enrollment.guarantor2_name) {
      extras.push({
        id: enrollment.guarantor2,
        full_name: enrollment.guarantor2_name,
        member_no: enrollment.guarantor2_member_no || '',
      })
    }
    loadMembersForSelect('', extras)
    setEditMemberModal(true)
  }

  const handleUpdateMember = async () => {
    if (!editingMemberEnrollment) return
    setSubmitting(true)
    try {
      const values = await editMemberForm.validateFields()
      const payload = {
        enrollment_date: values.enrollment_date?.format('YYYY-MM-DD'),
        ticket_number: String(values.ticket_number),
        division_label: values.division_label,
        status: values.status,
        remarks: values.remarks || '',
      }

      if (values.is_registered_member !== false) {
        payload.member = values.member
        payload.non_member_name = ''
        payload.non_member_phone = ''
        payload.non_member_address = ''
      } else {
        payload.member = null
        payload.non_member_name = values.non_member_name
        payload.non_member_phone = values.non_member_phone
        payload.non_member_address = values.non_member_address
      }

      if (values.guarantor1_type === 'member') {
        payload.guarantor1 = values.guarantor1
        payload.guarantor1_non_member_name = ''
        payload.guarantor1_non_member_phone = ''
      } else if (values.guarantor1_type === 'non_member') {
        payload.guarantor1 = null
        payload.guarantor1_non_member_name = values.guarantor1_non_member_name
        payload.guarantor1_non_member_phone = values.guarantor1_non_member_phone
      } else {
        payload.guarantor1 = null
        payload.guarantor1_non_member_name = ''
        payload.guarantor1_non_member_phone = ''
      }

      if (values.guarantor2_type === 'member') {
        payload.guarantor2 = values.guarantor2
        payload.guarantor2_non_member_name = ''
        payload.guarantor2_non_member_phone = ''
      } else if (values.guarantor2_type === 'non_member') {
        payload.guarantor2 = null
        payload.guarantor2_non_member_name = values.guarantor2_non_member_name
        payload.guarantor2_non_member_phone = values.guarantor2_non_member_phone
      } else {
        payload.guarantor2 = null
        payload.guarantor2_non_member_name = ''
        payload.guarantor2_non_member_phone = ''
      }

      await chitsApi.patchEnrollment(editingMemberEnrollment.id, payload)
      message.success('Member enrollment details updated!')
      setEditMemberModal(false)
      if (selectedGroup) {
        loadEnrollments(selectedGroup.id)
      }
    } catch (err) {
      message.error(err?.response?.data?.message || err?.response?.data?.non_field_errors?.[0] || 'Failed to update member.')
    } finally {
      setSubmitting(false)
    }
  }

  const openEditGroupModal = (group) => {
    setEditingGroup(group)
    editGroupForm.resetFields()
    editGroupForm.setFieldsValue({
      group_no: group.group_no,
      group_name: group.group_name,
      chit_value: parseFloat(group.chit_value),
      total_members: group.total_members,
      duration_months: group.duration_months,
      number_of_divisions: group.number_of_divisions,
      division_labels: group.division_labels,
      current_month: group.current_month,
      commission_rate: parseFloat(group.commission_rate || 0),
      processing_days: group.processing_days || 7,
      start_date: group.start_date ? dayjs(group.start_date) : dayjs(),
      end_date: group.end_date ? dayjs(group.end_date) : null,
      status: group.status,
      remarks: group.remarks,
    })
    setEditGroupModal(true)
  }

  const handleUpdateGroup = async () => {
    if (!editingGroup) return
    setSubmitting(true)
    try {
      const values = await editGroupForm.validateFields()
      const payload = {
        ...values,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : null,
      }
      await chitsApi.patchChitGroup(editingGroup.id, payload)
      message.success('Welfare scheme updated!')
      setEditGroupModal(false)
      await loadGroups()
      if (selectedGroup && selectedGroup.id === editingGroup.id) {
        const updatedRes = await chitsApi.getChitGroup(editingGroup.id)
        setSelectedGroup(updatedRes.data)
      }
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to update welfare scheme.')
    } finally {
      setSubmitting(false)
    }
  }

  const openAuctionModal = async (monthNum) => {
    if (!selectedGroup) return
    const targetMonth = monthNum || selectedGroup.current_month
    setSelectedAuctionMonth(targetMonth)
    setSubmitting(true)
    try {
      const res = await chitsApi.getActiveAuction(selectedGroup.id, targetMonth)
      setActiveAuction(res.data)
      if (res.data?.slots) {
        setAuctionSlots(res.data.slots.map(s => ({
          id: s.id,
          division_label: s.division_label,
          slot_type: s.slot_type || 'caller',
          enrollment: s.enrollment || null,
          bid_amount: s.bid_amount !== undefined ? parseFloat(s.bid_amount) : parseFloat(selectedGroup.chit_value),
          commission_amount: s.commission_amount !== undefined ? parseFloat(s.commission_amount) : parseFloat(selectedGroup.commission_rate || 0),
          service_charge: s.service_charge !== undefined ? parseFloat(s.service_charge) : 0,
        })))
      }
      setAuctionModal(true)
    } catch (_) {
      message.error('Failed to load auction details for Month ' + targetMonth)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCompleteAuction = async () => {
    const remainingCount = enrollments.filter(e => !e.prize_won).length
    const winnersCount = auctionSlots.filter(s => s.slot_type === 'winner').length

    if (winnersCount < 1) {
      message.error('At least one slot must be designated as the Winner.')
      return
    }

    if (remainingCount > 3) {
      if (winnersCount !== 1) {
        message.error('Exactly one slot must be designated as the Winner.')
        return
      }
    }

    const missingEnrollment = auctionSlots.some(s => !s.enrollment)
    if (missingEnrollment) {
      message.error('All slots must be assigned to an enrolled member.')
      return
    }

    const enrollIds = auctionSlots.map(s => s.enrollment)
    const hasDuplicates = new Set(enrollIds).size !== enrollIds.length
    if (hasDuplicates) {
      message.error('A member cannot win/call multiple slots in the same month.')
      return
    }

    setSubmitting(true)
    try {
      await chitsApi.completeActiveAuction(selectedGroup.id, {
        month_number: selectedAuctionMonth,
        slots: auctionSlots
      })
      message.success(`Month ${selectedAuctionMonth} auction details saved successfully!`)
      setAuctionModal(false)
      await loadGroups()
      if (selectedGroup) {
        const updatedGroupRes = await chitsApi.getChitGroup(selectedGroup.id)
        setSelectedGroup(updatedGroupRes.data)
      }
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to complete monthly auction.')
    } finally {
      setSubmitting(false)
    }
  }

  const openClearDuesModal = (enrollment) => {
    clearDuesForm.resetFields()
    clearDuesForm.setFieldsValue({
      up_to_month: selectedGroup?.current_month || 1,
      payment_mode: 'cash',
      paid_date: dayjs(),
      receipt_no: '',
    })
    setClearDuesModal({ open: true, enrollment })
  }

  const handleClearDuesSubmit = async () => {
    if (!clearDuesModal.enrollment) return
    setSubmitting(true)
    try {
      const values = await clearDuesForm.validateFields()
      const res = await chitsApi.clearDuesUpToMonth(clearDuesModal.enrollment.id, {
        up_to_month: values.up_to_month,
        paid_date: values.paid_date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
        payment_mode: values.payment_mode,
        receipt_no: values.receipt_no || '',
      })
      message.success(res.data?.message || 'Dues cleared successfully!')
      setClearDuesModal({ open: false, enrollment: null })
      if (selectedGroup) {
        loadEnrollments(selectedGroup.id)
      }
      loadOverdue()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to clear dues.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleActivateGroup = async (groupId) => {
    setSubmitting(true)
    try {
      await chitsApi.patchChitGroup(groupId, { status: 'active' })
      message.success('Welfare scheme activated! You can now enroll members.')
      await loadGroups()
      if (selectedGroup) {
        const updatedGroupRes = await chitsApi.getChitGroup(selectedGroup.id)
        setSelectedGroup(updatedGroupRes.data)
      }
    } catch (_) {
      message.error('Failed to activate welfare scheme.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePayment = async (data) => {
    setSubmitting(true)
    try {
      await chitsApi.recordPayment(paymentModal.payment.enrollment_id, {
        ...data,
        month_number: paymentModal.payment.month_number,
        amount_paid: paymentModal.payment.amount_paid,
      })
      message.success('Payment recorded!')
      setPaymentModal({ open: false, payment: null })
      if (selectedGroup) loadEnrollments(selectedGroup.id)
      loadOverdue()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Payment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const activeGroups = groups.filter((g) => g.status === 'active')

  const groupColumns = [
    {
      title: 'Welfare No', dataIndex: 'group_no', key: 'group_no', width: 130,
      render: (v) => <Text style={{ color: '#2563eb', fontWeight: 600, fontFamily: 'monospace' }}>{v}</Text>,
    },
    { title: 'Name', dataIndex: 'group_name', key: 'group_name' },
    { title: 'Value', dataIndex: 'chit_value', width: 120, render: (v) => formatCurrency(v) },
    { title: 'Monthly', dataIndex: 'monthly_instalment', width: 110, render: (v) => formatCurrency(v) },
    { title: 'Duration', dataIndex: 'duration_months', width: 90, render: (v) => `${v}m` },
    { title: 'Start', dataIndex: 'start_date', width: 110, render: (v) => formatDate(v) },
    { title: 'Status', dataIndex: 'status', width: 100, render: (v) => <StatusBadge status={v} /> },
    { title: 'Members', dataIndex: 'enrolled_count', width: 80, render: (v) => <Tag color="blue">{v || 0}</Tag> },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 240,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small" icon={<EyeOutlined />}
            onClick={() => { setActiveTab('groups'); setSelectedGroup(row) }}
            style={{ color: '#2563eb' }}
          >
            View
          </Button>
          {canWrite && (
            <>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditGroupModal(row)}
              >
                Edit
              </Button>
              <Button
                size="small" 
                type="primary" 
                icon={<UserAddOutlined />}
                disabled={row.enrolled_count >= row.total_members}
                onClick={() => openAddMemberModal(row)}
              >
                Add
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  const overdueColumns = [
    {
      title: 'Member', key: 'member',
      render: (_, row) => (
        <div
          style={{ cursor: 'pointer' }}
          onClick={() => row.member_id && navigate(`/members/${row.member_id}`)}
        >
          <div style={{ fontWeight: 600, color: '#3b82f6' }}>{row.member_name || '—'}</div>
          <div style={{ color: '#9ba3bc', fontSize: 11 }}>{row.member_no}</div>
        </div>
      ),
    },
    {
      title: 'Welfare Scheme', key: 'group',
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.group_name || '—'}</div>
          <div style={{ color: '#9ba3bc', fontSize: 11 }}>{row.group_no}</div>
        </div>
      ),
    },
    { title: 'Month', dataIndex: 'month_number', width: 70 },
    {
      title: 'Remaining Due',
      key: 'remaining_due',
      width: 140,
      render: (_, row) => {
        const remaining = parseFloat(row.installment_amount || 0) - parseFloat(row.amount_paid || 0)
        return (
          <div>
            <Text style={{ fontWeight: 600, color: '#ef4444' }}>{formatCurrency(remaining)}</Text>
            {parseFloat(row.amount_paid || 0) > 0 && (
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Paid: {formatCurrency(row.amount_paid)} of {formatCurrency(row.installment_amount)}
              </div>
            )}
          </div>
        )
      }
    },
    { title: 'Due Date', dataIndex: 'due_date', width: 110, render: (v) => formatDate(v) },
    {
      title: 'Overdue', dataIndex: 'days_overdue', width: 100,
      render: (v) => <Tag color="error">{v || 0}d</Tag>,
    },
    canWrite ? {
      title: 'Action', key: 'action', fixed: 'right', width: 140,
      render: (_, row) => (
        <Button size="small" type="primary" danger
          onClick={() => setPaymentModal({ open: true, payment: row })}
        >
          Record Payment
        </Button>
      ),
    } : {},
  ].filter((c) => Object.keys(c).length > 0)

  // --- Group Detail panel (shown inline under table, not as a tab) ---
  const GroupDetailPanel = ({ group }) => (
    <Card
      style={{ marginTop: 16, borderTop: '3px solid #2563eb' }}
      title={
        <Space>
          <Button
            size="small" icon={<ArrowLeftOutlined />}
            onClick={() => setSelectedGroup(null)}
          >
            All Schemes
          </Button>
          <SafetyOutlined style={{ color: '#2563eb' }} />
          <Text style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{group.group_name}</Text>
          <Tag color="blue" style={{ fontFamily: 'monospace' }}>{group.group_no}</Tag>
          <StatusBadge status={group.status} />
        </Space>
      }
      extra={
        canWrite && (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditGroupModal(group)}
            >
              Edit Scheme
            </Button>
            {group.status === 'active' && (
              <Button 
                type="primary" 
                icon={<UserAddOutlined />} 
                size="small"
                disabled={group.enrolled_count >= group.total_members}
                onClick={() => openAddMemberModal(group)}
              >
                {group.enrolled_count >= group.total_members ? 'Scheme Full' : 'Add Member'}
              </Button>
            )}
          </Space>
        )
      }
    >
      {/* Scheme stats */}
      <Row gutter={[12, 8]} style={{ marginBottom: 20 }}>
        {[
          { label: 'Welfare Value', value: formatCurrency(group.chit_value), color: '#1e40af' },
          { label: 'Current Month Installment', value: formatCurrency(group.monthly_instalment), color: '#7c3aed' },
          { label: 'Duration', value: `${group.duration_months} months`, color: '#059669' },
          { label: 'Current Month', value: `Month ${group.current_month} / ${group.duration_months}`, color: '#d97706' },
          { label: 'Divisions / Slots', value: `${group.number_of_divisions} divisions`, color: '#2563eb' },
          { label: 'Enrolled Members', value: `${enrollments.length} / ${group.total_members}`, color: '#0891b2' },
          { label: 'Commission Rate / Slot', value: formatCurrency(group.commission_rate || 0), color: '#dc2626' },
          {
            label: 'Total Profit Tracked',
            value: formatCurrency(
              (Array.isArray(auctionsHistory) ? auctionsHistory : []).reduce((sum, a) => {
                const slotsSum = a.slots?.reduce((s, slot) => s + parseFloat(slot.profit_earned || 0), 0) || 0
                return sum + slotsSum
              }, 0)
            ),
            color: '#16a34a',
          },
        ].map((s) => (
          <Col key={s.label} xs={12} sm={8} md={3}>
            <Card size="small" style={{ textAlign: 'center', borderColor: '#334155', background: '#1e293b' }}
              bodyStyle={{ padding: '10px 8px' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontWeight: 700, color: s.color, fontSize: 13 }}>{s.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Welfare Status Action Bar */}
      {group.status === 'upcoming' && (
        <Alert
          message={
            <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 10 }}>
              <span>
                <strong>Welfare Scheme is Upcoming.</strong> Members cannot be enrolled and auctions cannot be started until you activate it.
              </span>
              {canWrite && (
                <Button type="primary" size="small" loading={submitting} onClick={() => handleActivateGroup(group.id)}>
                  Activate Welfare Scheme
                </Button>
              )}
            </div>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 20 }}
        />
      )}

      {group.status === 'active' && (
        <Alert
          message={
            <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 10 }}>
              <span>
                <strong>Month {group.current_month} Auction is Pending.</strong> Enter winner and caller bids to complete the month and recalculate the next month installment.
              </span>
              {canWrite && (
                <Button type="primary" size="small" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => openAuctionModal(group.current_month)}>
                  Launch Month {group.current_month} Auction
                </Button>
              )}
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
        />
      )}

      <Tabs
        defaultActiveKey="members"
        items={[
          {
            key: 'members',
            label: `Enrolled Members (${enrollments.length})`,
            children: (
              <div>
                {enrollments.length === 0 && !enrollLoading && (
                  <Alert
                    message="No members enrolled yet"
                    description={group.status === 'active' ? 'Click "Add Member" to enroll members.' : 'This scheme is not active yet.'}
                    type="info" showIcon style={{ marginBottom: 12 }}
                  />
                )}
                <Table
                  dataSource={enrollments}
                  loading={enrollLoading}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: true }}
                  columns={[
                    {
                      title: 'Token / Ticket',
                      dataIndex: 'ticket_number',
                      width: 120,
                      sorter: (a, b) => {
                        const numA = parseInt(String(a.ticket_number || '').replace(/\D/g, ''), 10) || 0;
                        const numB = parseInt(String(b.ticket_number || '').replace(/\D/g, ''), 10) || 0;
                        return numA - numB;
                      },
                      defaultSortOrder: 'ascend',
                      render: (v) => <Tag color="blue">#{v}</Tag>
                    },
                    {
                      title: 'Member', key: 'member',
                      render: (_, row) => (
                        <div style={{ cursor: 'pointer' }} onClick={() => row.member && navigate(`/members/${row.member}`)}>
                          <div style={{ fontWeight: 600, color: '#3b82f6' }}>{row.member_name}</div>
                          <div style={{ fontSize: 11, color: '#9ba3bc' }}>{row.member_no}</div>
                          {!row.member && (
                            <div style={{ fontSize: 11, color: '#eab308', marginTop: 4 }}>
                              Guarantors: {row.guarantor1_name} &amp; {row.guarantor2_name}
                            </div>
                          )}
                        </div>
                      ),
                    },
                    { title: 'Enroll Date', dataIndex: 'enrollment_date', width: 110, render: (v) => formatDate(v) },
                    { title: 'Paid Months', dataIndex: 'paid_months', width: 100,
                      render: (v) => `${v || 0} / ${group.duration_months}` },
                    { title: 'Total Paid', dataIndex: 'total_paid_amount',
                      render: (v) => <Text style={{ color: '#059669', fontWeight: 600 }}>{formatCurrency(v)}</Text> },
                    { title: 'Status', dataIndex: 'status', width: 90, render: (v) => <StatusBadge status={v} /> },
                    { title: 'Draw Details', key: 'prize_won', width: 220,
                      render: (_, row) => {
                        if (!row.prize_won) return <Text style={{ color: '#9ca3af' }}>In Draw Pool</Text>;
                        
                        const readyDate = dayjs(row.prize_date).add(group.processing_days || 7, 'day');
                        const daysLeft = readyDate.diff(dayjs(), 'day');
                        const isPastReady = daysLeft <= 0;

                        return (
                          <div>
                            <Tag color="gold">🏆 Awarded</Tag>
                            <div style={{ fontSize: 11, color: '#9ba3bc', marginTop: 2 }}>
                              Prize: {formatCurrency(row.prize_amount)}
                            </div>
                            {parseFloat(row.surcharge_amount) > 0 && (
                              <div style={{ fontSize: 10, color: '#10b981' }}>
                                Surcharge: {formatCurrency(row.surcharge_amount)}
                              </div>
                            )}
                            {parseFloat(row.reduction_amount) > 0 && (
                              <div style={{ fontSize: 10, color: '#ef4444' }}>
                                Reduction: {formatCurrency(row.reduction_amount)}
                              </div>
                            )}
                            {row.received_date ? (
                              <div style={{ fontSize: 11, color: '#059669', marginTop: 4, fontWeight: 'bold' }}>
                                Handed Over: {formatDate(row.received_date)}
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: isPastReady ? '#059669' : '#d97706', marginTop: 4 }}>
                                {isPastReady ? 'Ready for Handover' : `Processing Period (Ready in ${daysLeft} days)`}
                                <div style={{ fontSize: 9, color: '#6b7280' }}>
                                  ({readyDate.format('DD/MM/YYYY')})
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                    },
                    {
                      title: 'Actions', key: 'actions', fixed: 'right', width: 440,
                      render: (_, row) => {
                        const readyDate = dayjs(row.prize_date).add(group.processing_days || 7, 'day');
                        const daysLeft = readyDate.diff(dayjs(), 'day');
                        const isEditable = row.prize_won && !row.received_date && (daysLeft >= 0);

                        return (
                          <Space>
                            {row.member ? (
                              <Button size="small" onClick={() => navigate(`/members/${row.member}`)}>
                                Profile
                              </Button>
                            ) : (
                              <Tag color="orange">Non-Member</Tag>
                            )}
                            <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewPayments(row)} style={{ color: '#2563eb' }}>
                              View Payments
                            </Button>
                            {canWrite && (
                              <>
                                <Button size="small" icon={<EditOutlined />} onClick={() => openEditMemberModal(row)}>
                                  Edit Details
                                </Button>
                                <Button size="small" type="primary" style={{ backgroundColor: '#0284c7', borderColor: '#0284c7' }} icon={<CheckCircleOutlined />} onClick={() => openClearDuesModal(row)}>
                                  Pay Dues Till Month
                                </Button>
                              </>
                            )}
                            {isEditable && canWrite && (
                              <Button size="small" type="primary" onClick={() => openEditPayoutModal(row)}>
                                Edit Payout
                              </Button>
                            )}
                            {row.prize_won && !row.received_date && canWrite && (
                              <Button size="small" type="primary" style={{ backgroundColor: '#10b981', borderColor: '#10b981' }} onClick={() => openHandoverModal(row)}>
                                Handover Money
                              </Button>
                            )}
                          </Space>
                        );
                      },
                    },
                  ]}
                />
              </div>
            )
          },
          {
            key: 'history',
            label: `Auction & Payout History (${auctionsHistory.length})`,
            children: (
              <Table
                dataSource={auctionsHistory}
                loading={historyLoading}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 15 }}
                scroll={{ x: true }}
                columns={[
                  { title: 'Month #', dataIndex: 'month_number', key: 'month_number', width: 85 },
                  { title: 'Installment', dataIndex: 'installment_amount', key: 'installment_amount', render: v => formatCurrency(v) },
                  { title: 'Date Completed', dataIndex: 'completed_date', key: 'completed_date', render: v => formatDate(v) },
                  {
                    title: 'Winner Slot', key: 'winner',
                    render: (_, row) => {
                      const winner = row.slots?.find(s => s.slot_type === 'winner')
                      if (!winner) return '—'
                      const name = winner.member_name || winner.non_member_name || 'Non-member'
                      return (
                        <div>
                          <div style={{ fontWeight: 600, color: '#d97706' }}>{name}</div>
                          <Tag color="gold" style={{ fontSize: 10 }}>Ticket {winner.enrollment_ticket_number || '—'}</Tag>
                        </div>
                      )
                    }
                  },
                  {
                    title: 'Caller Slots', key: 'callers',
                    render: (_, row) => {
                      const callers = row.slots?.filter(s => s.slot_type === 'caller') || []
                      return (
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                          {callers.map((c, idx) => {
                            const name = c.member_name || c.non_member_name || 'Non-member'
                            return (
                              <li key={idx}>
                                {name} (Ticket {c.enrollment_ticket_number}) · Bid: <strong>{formatCurrency(c.bid_amount)}</strong>
                              </li>
                            )
                          })}
                        </ul>
                      )
                    }
                  },
                  {
                    title: 'Month Profit (Firm)', key: 'profit',
                    render: (_, row) => {
                      const totalProfit = row.slots?.reduce((sum, s) => sum + parseFloat(s.profit_earned || 0), 0) || 0
                      return <span style={{ color: '#16a34a', fontWeight: 600 }}>{formatCurrency(totalProfit)}</span>
                    }
                  }
                ]}
              />
            )
          }
        ]}
      />
    </Card>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={3} style={{ color: 'var(--color-text-primary)', margin: 0 }}>Welfare Funds</Title>
          <Text style={{ color: 'var(--color-text-secondary)' }}>
            {groups.length} schemes total · {activeGroups.length} active
          </Text>
        </div>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setGroupModal(true)} id="add-chit-group-btn">
            New Welfare Scheme
          </Button>
        )}
      </div>

      {/* Active Schemes Summary Banner */}
      {activeGroups.length > 0 && (
        <Card
          style={{ marginBottom: 20, background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155' }}
          bodyStyle={{ padding: '16px 20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <SafetyOutlined style={{ color: '#60a5fa', fontSize: 18 }} />
            <Text style={{ fontWeight: 700, fontSize: 15, color: '#93c5fd' }}>Active Welfare Schemes</Text>
            <Tag color="blue" style={{ borderRadius: 20 }}>{activeGroups.length} active</Tag>
          </div>
          <Row gutter={[12, 8]}>
            {activeGroups.map((g, idx) => (
              <Col key={g.id} xs={24} sm={12} md={8} lg={6}>
                <div
                  style={{
                    background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                    padding: '10px 14px', cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  }}
                  onClick={() => { setActiveTab('groups'); setSelectedGroup(g) }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#0f172a', border: '1px solid #334155',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#60a5fa',
                    }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#93c5fd' }}>{g.group_name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {g.group_no} · {formatCurrency(g.monthly_instalment)}/mo · {g.enrolled_count || 0} members
                      </div>
                    </div>
                  </div>
                  {canWrite && (
                    <Button size="small" type="link" style={{ padding: 0, marginTop: 4, fontSize: 12 }}
                      icon={<UserAddOutlined />}
                      onClick={(e) => { e.stopPropagation(); openAddMemberModal(g) }}>
                      Add Member
                    </Button>
                  )}
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Tabs — groups tab always stays visible */}
      <Tabs
        activeKey={activeTab}
        onChange={(key) => { setActiveTab(key); setSelectedGroup(null) }}
        items={[
          {
            key: 'groups',
            label: 'All Welfare Schemes',
            children: (
              <>
                {/* Table always visible */}
                <Table
                  columns={groupColumns}
                  dataSource={groups}
                  loading={loading}
                  rowKey="id"
                  id="chit-groups-table"
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: 900 }}
                  onRow={(row) => ({
                    onDoubleClick: () => { setSelectedGroup(row) },
                    style: { cursor: 'pointer' },
                  })}
                />
                {/* Detail panel appears BELOW the table */}
                {selectedGroup && <GroupDetailPanel group={selectedGroup} />}
              </>
            ),
          },
          {
            key: 'overdue',
            label: (
              <span>
                Overdue Payments
                {overduePayments.length > 0 && (
                  <Tag color="error" style={{ marginLeft: 6 }}>{overduePayments.length}</Tag>
                )}
              </span>
            ),
            children: (
              <>
                {overduePayments.length === 0 && !overdueLoading && (
                  <Alert message="No overdue payments" description="All welfare payments are up to date."
                    type="success" showIcon style={{ marginBottom: 16 }} />
                )}
                <Table
                  columns={overdueColumns}
                  dataSource={overduePayments}
                  loading={overdueLoading}
                  rowKey="id"
                  id="chit-overdue-table"
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: true }}
                />
              </>
            ),
          },
        ]}
      />

      {/* Create Welfare Scheme Modal */}
      <Modal
        title="Create Welfare Scheme"
        open={groupModal}
        onCancel={() => { setGroupModal(false); groupForm.resetFields() }}
        onOk={handleCreateGroup}
        confirmLoading={submitting}
        okText="Create Scheme"
        width={640}
      >
        <Form form={groupForm} layout="vertical" onFinish={handleCreateGroup} onSubmit={(e) => e.preventDefault()} initialValues={{ number_of_divisions: 2, division_labels: 'A, B', status: 'upcoming', commission_rate: 0 }}>
          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item label="Welfare No" name="group_no" rules={[{ required: true, message: 'Required' }]}>
                <Input id="chit-group-no" placeholder="e.g. WF-2026-001" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Scheme Name" name="group_name" rules={[{ required: true, message: 'Required' }]}>
                <Input id="chit-group-name" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Welfare Value (₹)" name="chit_value" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber id="chit-value" min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Number of Divisions" name="number_of_divisions" rules={[{ required: false }]}>
                <InputNumber id="chit-divisions" min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Division Labels (Comma-separated)" name="division_labels" rules={[{ required: false }]} extra="E.g., A, B. Leave blank for default sequence.">
                <Input id="chit-division-labels" placeholder="e.g. A, B" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Duration (Months)" name="duration_months" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber id="chit-duration" min={1} max={120} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Total Members" name="total_members" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber id="chit-total-members" min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Start Date" name="start_date" rules={[{ required: true, message: 'Required' }]}>
                <DatePicker id="chit-start-date" style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="End Date (optional)" name="end_date">
                <DatePicker id="chit-end-date" style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Commission Rate / Surcharge (₹)" name="commission_rate" initialValue={0}>
                <InputNumber id="chit-commission" min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Status" name="status" initialValue="upcoming">
                <Select id="chit-status">
                  <Option value="upcoming">Upcoming</Option>
                  <Option value="active">Active</Option>
                  <Option value="completed">Completed</Option>
                  <Option value="terminated">Terminated</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Processing Period" name="processing_days" initialValue={7} rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} style={{ width: '100%' }} addonAfter="days" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Card style={{ background: '#022c22', borderColor: '#065f46', textAlign: 'center', marginTop: 10 }}>
                <Text style={{ fontSize: 13, color: '#34d399', display: 'block', fontWeight: 600 }}>
                  Calculated Monthly Installment (Month 1):
                </Text>
                <Title level={4} style={{ color: '#10b981', margin: '4px 0 0' }}>
                  ₹{(watchChitValue && watchDurationMonths)
                    ? Math.round(watchChitValue / watchDurationMonths).toLocaleString('en-IN')
                    : '0'}
                </Title>
              </Card>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        title={
          <Space>
            <UserAddOutlined style={{ color: '#2563eb' }} />
            <span>Add Member / Non-Member to {selectedGroup?.group_name || 'Welfare Scheme'}</span>
          </Space>
        }
        open={enrollModal}
        onCancel={() => { setEnrollModal(false); enrollForm.resetFields() }}
        onOk={handleEnrollMember}
        confirmLoading={submitting}
        okText="Add Person"
        width={560}
        destroyOnClose
      >
        {selectedGroup && (
          <Alert
            message={`Scheme: ${selectedGroup.group_name} (${selectedGroup.group_no})`}
            description={`Monthly: ${formatCurrency(selectedGroup.monthly_instalment)} · Duration: ${selectedGroup.duration_months} months · Active Month: ${selectedGroup.current_month}`}
            type="info" showIcon style={{ marginBottom: 16 }}
          />
        )}
        <Form form={enrollForm} layout="vertical" onFinish={handleEnrollMember} onSubmit={(e) => e.preventDefault()} initialValues={{ is_registered_member: true, guarantor1_type: 'none', guarantor2_type: 'none', initial_paid_months: 0 }}>
          <Form.Item
            label="Is Registered Member?"
            name="is_registered_member"
            valuePropName="checked"
          >
            <Switch checkedChildren="Yes (Member)" unCheckedChildren="No (Non-Member)" />
          </Form.Item>

          {isRegisteredMember !== false ? (
            <Form.Item
              label="Select Member"
              name="member"
              rules={[{ required: true, message: 'Please select a member' }]}
            >
              <Select
                id="enroll-member-select"
                showSearch
                loading={membersLoading}
                filterOption={false}
                onSearch={(v) => loadMembersForSelect(v)}
                onFocus={() => members.length === 0 && loadMembersForSelect('')}
                placeholder="Search member by name or number..."
                notFoundContent={membersLoading ? 'Searching...' : 'No members found. Type to search.'}
              >
                {members.filter(m => m.id !== enrollGuarantor1 && m.id !== enrollGuarantor2).map((m) => (
                  <Option key={m.id} value={m.id}>
                    <span style={{ fontWeight: 600 }}>{m.full_name}</span>
                    <span style={{ color: '#9ba3bc', fontSize: 12, marginLeft: 8 }}>({m.member_no})</span>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <>
              <Form.Item
                label="Non-Member Full Name"
                name="non_member_name"
                rules={[{ required: true, message: 'Name is required' }]}
              >
                <Input placeholder="Enter full name" />
              </Form.Item>
              <Form.Item
                label="Non-Member Phone Number"
                name="non_member_phone"
                rules={[{ required: true, message: 'Phone is required' }]}
              >
                <Input placeholder="Enter phone number" />
              </Form.Item>
              <Form.Item
                label="Non-Member Address"
                name="non_member_address"
              >
                <Input.TextArea placeholder="Enter address details" rows={2} />
              </Form.Item>
            </>
          )}

          {/* Guarantors Selection (Member OR Non-Member) */}
          <Divider style={{ margin: '12px 0' }}><Text type="secondary" style={{ fontSize: 12 }}>Guarantor Details (Member or Non-Member)</Text></Divider>

          <Form.Item label="Guarantor 1 Type" name="guarantor1_type">
            <Select onChange={() => enrollForm.setFieldsValue({ guarantor1: undefined, guarantor1_non_member_name: '', guarantor1_non_member_phone: '' })}>
              <Option value="none">None</Option>
              <Option value="member">Registered Member</Option>
              <Option value="non_member">Non-Member (External Person)</Option>
            </Select>
          </Form.Item>

          {guarantor1Type === 'non_member' && (
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Guarantor 1 Name" name="guarantor1_non_member_name">
                  <Input placeholder="Full name" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Guarantor 1 Phone" name="guarantor1_non_member_phone">
                  <Input placeholder="Phone number" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {guarantor1Type === 'member' && (
            <Form.Item label="Guarantor 1 (Member)" name="guarantor1">
              <Select
                showSearch
                loading={membersLoading}
                filterOption={false}
                onSearch={(v) => loadMembersForSelect(v)}
                onFocus={() => members.length === 0 && loadMembersForSelect('')}
                placeholder="Search member..."
                allowClear
              >
                {members.filter(m => m.id !== enrollMember && m.id !== enrollGuarantor2).map((m) => (
                  <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item label="Guarantor 2 Type" name="guarantor2_type">
            <Select onChange={() => enrollForm.setFieldsValue({ guarantor2: undefined, guarantor2_non_member_name: '', guarantor2_non_member_phone: '' })}>
              <Option value="none">None (Optional)</Option>
              <Option value="member">Registered Member</Option>
              <Option value="non_member">Non-Member (External Person)</Option>
            </Select>
          </Form.Item>

          {guarantor2Type === 'non_member' && (
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Guarantor 2 Name" name="guarantor2_non_member_name">
                  <Input placeholder="Full name" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Guarantor 2 Phone" name="guarantor2_non_member_phone">
                  <Input placeholder="Phone number" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {guarantor2Type === 'member' && (
            <Form.Item label="Guarantor 2 (Member)" name="guarantor2">
              <Select
                showSearch
                loading={membersLoading}
                filterOption={false}
                onSearch={(v) => loadMembersForSelect(v)}
                onFocus={() => members.length === 0 && loadMembersForSelect('')}
                placeholder="Search member..."
                allowClear
              >
                {members.filter(m => m.id !== enrollMember && m.id !== enrollGuarantor1).map((m) => (
                  <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Divider style={{ margin: '12px 0' }} />

          <Form.Item
            label="Ticket / Token Number (Auto-Incremented)"
            name="ticket_number"
            extra="Automatically assigned next sequential token number."
          >
            <Input id="enroll-ticket" placeholder="e.g. 21" />
          </Form.Item>
          <Form.Item
            label="Enrollment Date"
            name="enrollment_date"
            initialValue={dayjs()}
          >
            <DatePicker id="enroll-date" style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          {selectedGroup && selectedGroup.current_month > 1 && (
            <Form.Item
              label="Paid Up To Month Number (Early-Started Scheme)"
              name="initial_paid_months"
              extra={`Scheme is currently at Month ${selectedGroup.current_month}. Enter how many months this member has ALREADY paid for in this scheme (e.g. ${selectedGroup.current_month - 1}).`}
            >
              <InputNumber min={0} max={selectedGroup.current_month} style={{ width: '100%' }} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Edit Enrolled Member Modal */}
      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: '#2563eb' }} />
            <span>Edit Member Enrollment Details</span>
          </Space>
        }
        open={editMemberModal}
        onCancel={() => setEditMemberModal(false)}
        onOk={handleUpdateMember}
        confirmLoading={submitting}
        okText="Save Changes"
        width={560}
        destroyOnClose
      >
        <Form form={editMemberForm} layout="vertical" onFinish={handleUpdateMember} onSubmit={(e) => e.preventDefault()}>
          <Form.Item
            label="Is Registered Member?"
            name="is_registered_member"
            valuePropName="checked"
          >
            <Switch checkedChildren="Yes (Member)" unCheckedChildren="No (Non-Member)" />
          </Form.Item>

          {isRegisteredMemberEdit !== false ? (
            <Form.Item
              label="Select Member"
              name="member"
              rules={[{ required: true, message: 'Please select a member' }]}
            >
              <Select
                showSearch
                loading={membersLoading}
                filterOption={false}
                onSearch={(v) => loadMembersForSelect(v)}
                onFocus={() => members.length === 0 && loadMembersForSelect('')}
                placeholder="Search member by name or number..."
              >
                {members.map((m) => (
                  <Option key={m.id} value={m.id}>
                    <span style={{ fontWeight: 600 }}>{m.full_name}</span>
                    <span style={{ color: '#9ba3bc', fontSize: 12, marginLeft: 8 }}>({m.member_no})</span>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <>
              <Form.Item label="Non-Member Full Name" name="non_member_name" rules={[{ required: true, message: 'Name is required' }]}>
                <Input placeholder="Enter full name" />
              </Form.Item>
              <Form.Item label="Non-Member Phone Number" name="non_member_phone" rules={[{ required: true, message: 'Phone is required' }]}>
                <Input placeholder="Enter phone number" />
              </Form.Item>
              <Form.Item label="Non-Member Address" name="non_member_address">
                <Input.TextArea placeholder="Enter address details" rows={2} />
              </Form.Item>
            </>
          )}

          <Divider style={{ margin: '12px 0' }}><Text type="secondary" style={{ fontSize: 12 }}>Guarantor Details</Text></Divider>

          <Form.Item label="Guarantor 1 Type" name="guarantor1_type">
            <Select>
              <Option value="none">None</Option>
              <Option value="member">Registered Member</Option>
              <Option value="non_member">Non-Member (External Person)</Option>
            </Select>
          </Form.Item>

          {guarantor1TypeEdit === 'non_member' && (
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Guarantor 1 Name" name="guarantor1_non_member_name">
                  <Input placeholder="Full name" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Guarantor 1 Phone" name="guarantor1_non_member_phone">
                  <Input placeholder="Phone number" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {guarantor1TypeEdit === 'member' && (
            <Form.Item label="Guarantor 1 (Member)" name="guarantor1">
              <Select showSearch loading={membersLoading} filterOption={false} onSearch={(v) => loadMembersForSelect(v)} onFocus={() => members.length === 0 && loadMembersForSelect('')} placeholder="Search member..." allowClear>
                {members.map((m) => (
                  <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item label="Guarantor 2 Type" name="guarantor2_type">
            <Select>
              <Option value="none">None</Option>
              <Option value="member">Registered Member</Option>
              <Option value="non_member">Non-Member (External Person)</Option>
            </Select>
          </Form.Item>

          {guarantor2TypeEdit === 'non_member' && (
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Guarantor 2 Name" name="guarantor2_non_member_name">
                  <Input placeholder="Full name" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Guarantor 2 Phone" name="guarantor2_non_member_phone">
                  <Input placeholder="Phone number" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {guarantor2TypeEdit === 'member' && (
            <Form.Item label="Guarantor 2 (Member)" name="guarantor2">
              <Select showSearch loading={membersLoading} filterOption={false} onSearch={(v) => loadMembersForSelect(v)} onFocus={() => members.length === 0 && loadMembersForSelect('')} placeholder="Search member..." allowClear>
                {members.map((m) => (
                  <Option key={m.id} value={m.id}>{m.full_name} ({m.member_no})</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Divider style={{ margin: '12px 0' }} />

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Ticket Number" name="ticket_number" rules={[{ required: true, message: 'Ticket number required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Enrollment Date" name="enrollment_date" rules={[{ required: true, message: 'Date required' }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Status" name="status">
            <Select>
              <Option value="active">Active</Option>
              <Option value="awarded">Awarded</Option>
              <Option value="completed">Completed</Option>
              <Option value="defaulted">Defaulted</Option>
              <Option value="transferred">Transferred</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Remarks" name="remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Welfare Scheme Modal */}
      <Modal
        title={
          <Space>
            <SettingOutlined style={{ color: '#2563eb' }} />
            <span>Edit Welfare Scheme Properties</span>
          </Space>
        }
        open={editGroupModal}
        onCancel={() => setEditGroupModal(false)}
        onOk={handleUpdateGroup}
        confirmLoading={submitting}
        okText="Save Scheme Changes"
        width={640}
      >
        <Form form={editGroupForm} layout="vertical" onFinish={handleUpdateGroup} onSubmit={(e) => e.preventDefault()}>
          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item label="Welfare No" name="group_no" rules={[{ required: true, message: 'Required' }]}>
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Scheme Name" name="group_name" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Welfare Value (₹)" name="chit_value" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Total Members" name="total_members" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Duration (Months)" name="duration_months" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={1} max={120} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Current Active Month / Auctions Completed" name="current_month" rules={[{ required: true, message: 'Required' }]} extra="Set active auction month number for early-started schemes.">
                <InputNumber min={1} max={120} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Start Date" name="start_date" rules={[{ required: true, message: 'Required' }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Commission Rate / Surcharge (₹)" name="commission_rate">
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Status" name="status">
                <Select>
                  <Option value="upcoming">Upcoming</Option>
                  <Option value="active">Active</Option>
                  <Option value="completed">Completed</Option>
                  <Option value="terminated">Terminated</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Processing Period" name="processing_days" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} style={{ width: '100%' }} addonAfter="days" />
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

      {/* Clear Dues Up To Month Modal */}
      <Modal
        title={`Clear Welfare Dues — ${clearDuesModal.enrollment?.member_name || clearDuesModal.enrollment?.non_member_name}`}
        open={clearDuesModal.open}
        onCancel={() => setClearDuesModal({ open: false, enrollment: null })}
        onOk={handleClearDuesSubmit}
        confirmLoading={submitting}
        okText="Confirm & Pay All Dues Up To Month"
        width={500}
        destroyOnClose
      >
        {clearDuesModal.enrollment && selectedGroup && (
          <Alert
            message={`Scheme: ${selectedGroup.group_name} (${selectedGroup.group_no})`}
            description={`Monthly Installment: ${formatCurrency(selectedGroup.monthly_instalment)} · Current Active Month: ${selectedGroup.current_month}`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={clearDuesForm} layout="vertical" onFinish={handleClearDuesSubmit} onSubmit={(e) => e.preventDefault()}>
          <Form.Item
            label="Clear Dues Up To Month"
            name="up_to_month"
            rules={[{ required: true, message: 'Please select target month' }]}
            extra="All unpaid monthly installments up to this month will be marked as paid in a single click."
          >
            <Select style={{ width: '100%' }}>
              {Array.from({ length: selectedGroup?.current_month || 1 }, (_, i) => i + 1).map(m => (
                <Option key={m} value={m}>Month {m} (Up to Month {m})</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="Payment Date"
            name="paid_date"
            rules={[{ required: true, message: 'Please select date' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            label="Payment Mode"
            name="payment_mode"
            rules={[{ required: true, message: 'Please select payment mode' }]}
          >
            <Select style={{ width: '100%' }}>
              <Option value="cash">Cash</Option>
              <Option value="bank_transfer">Bank Transfer</Option>
              <Option value="cheque">Cheque</Option>
              <Option value="upi">UPI</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Receipt No / Ref (Optional)" name="receipt_no">
            <Input placeholder="e.g. REC-1024" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Monthly Auction Modal */}
      <Modal
        title={`Month ${selectedAuctionMonth} Auction & Drawings Control Panel`}
        open={auctionModal}
        onCancel={() => setAuctionModal(false)}
        onOk={handleCompleteAuction}
        confirmLoading={submitting}
        okText={`Save & Complete Month ${selectedAuctionMonth} Auction`}
        width={1150}
        destroyOnClose
      >
        {selectedGroup && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, background: '#1e293b', padding: '12px 16px', borderRadius: 8, border: '1px solid #334155' }}>
            <div>
              <Text style={{ fontWeight: 600, color: '#f8fafc' }}>Active Welfare Value: </Text>
              <Text style={{ color: '#60a5fa', fontWeight: 700 }}>{formatCurrency(selectedGroup.chit_value)}</Text>
              <span style={{ margin: '0 12px', color: '#475569' }}>|</span>
              <Text style={{ fontWeight: 600, color: '#f8fafc' }}>Committee Surcharge / Commission: </Text>
              <Text style={{ color: '#f87171', fontWeight: 700 }}>{formatCurrency(selectedGroup.commission_rate || 0)}</Text>
            </div>
            <Space>
              <Text style={{ fontWeight: 600, color: '#f8fafc' }}>Select Month to Record/View:</Text>
              <Select
                value={selectedAuctionMonth}
                onChange={(m) => openAuctionModal(m)}
                style={{ width: 140 }}
              >
                {Array.from({ length: selectedGroup.current_month || 1 }, (_, i) => i + 1).map(m => (
                  <Option key={m} value={m}>Month {m} {m === selectedGroup.current_month ? '(Active)' : '(Past)'}</Option>
                ))}
              </Select>
            </Space>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <Table
            dataSource={auctionSlots}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              {
                title: 'Division Slot',
                dataIndex: 'division_label',
                render: (v) => <Tag color="purple">Division {v}</Tag>,
                width: 110
              },
              {
                title: 'Slot Type',
                key: 'slot_type',
                width: 170,
                render: (_, row) => (
                  <Select
                    value={row.slot_type}
                    onChange={(val) => {
                      const updated = auctionSlots.map(s => {
                        if (s.id === row.id) {
                          return {
                            ...s,
                            slot_type: val,
                            bid_amount: val === 'winner' ? parseFloat(selectedGroup.chit_value) : s.bid_amount
                          }
                        }
                        return s
                      })
                      setAuctionSlots(updated)
                    }}
                    style={{ width: '100%' }}
                  >
                    <Option value="winner">Winner (Full Draw)</Option>
                    <Option value="caller">Caller (Bid/Auction)</Option>
                  </Select>
                )
              },
              {
                title: 'Recipient Member',
                key: 'enrollment',
                width: 250,
                render: (_, row) => (
                  <Select
                    value={row.enrollment}
                    onChange={(val) => {
                      const updated = auctionSlots.map(s => s.id === row.id ? { ...s, enrollment: val } : s)
                      setAuctionSlots(updated)
                    }}
                    placeholder="Select active member"
                    style={{ width: '100%' }}
                  >
                    {enrollments
                      .filter(e => e.status !== 'awarded' && !e.prize_won)
                      .map(e => (
                        <Option key={e.id} value={e.id}>
                          {e.member_name} ({e.ticket_number})
                        </Option>
                      ))}
                  </Select>
                )
              },
              {
                title: 'Gross Bid / Draw Value (₹)',
                key: 'bid_amount',
                width: 170,
                render: (_, row) => (
                  <InputNumber
                    value={row.bid_amount}
                    min={0}
                    disabled={row.slot_type === 'winner'}
                    onChange={(val) => {
                      const updated = auctionSlots.map(s => s.id === row.id ? { ...s, bid_amount: val } : s)
                      setAuctionSlots(updated)
                    }}
                    style={{ width: '100%' }}
                    prefix="₹"
                  />
                )
              },
              {
                title: 'Commission (₹)',
                key: 'commission_amount',
                width: 130,
                render: (_, row) => (
                  <InputNumber
                    value={row.commission_amount}
                    min={0}
                    onChange={(val) => {
                      const updated = auctionSlots.map(s => s.id === row.id ? { ...s, commission_amount: val } : s)
                      setAuctionSlots(updated)
                    }}
                    style={{ width: '100%' }}
                    prefix="₹"
                  />
                )
              },
              {
                title: 'Service Charge (₹)',
                key: 'service_charge',
                width: 130,
                render: (_, row) => (
                  <InputNumber
                    value={row.service_charge}
                    min={0}
                    onChange={(val) => {
                      const updated = auctionSlots.map(s => s.id === row.id ? { ...s, service_charge: val } : s)
                      setAuctionSlots(updated)
                    }}
                    style={{ width: '100%' }}
                    prefix="₹"
                  />
                )
              },
              {
                title: 'Net Handover (₹)',
                key: 'net_received',
                width: 130,
                render: (_, row) => {
                  const net = parseFloat(row.bid_amount || 0) - parseFloat(row.commission_amount || 0) - parseFloat(row.service_charge || 0)
                  return <strong>{formatCurrency(net)}</strong>
                }
              }
            ]}
          />
        </div>

        {selectedGroup && (
          <Row gutter={12} style={{ marginTop: 20 }}>
            <Col span={12}>
              <Card size="small" style={{ background: '#1e293b', borderColor: '#334155' }}>
                <Text style={{ display: 'block', fontSize: 12, color: '#94a3b8' }}>Total Gross Bids Sum:</Text>
                <Text style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                  {formatCurrency(auctionSlots.reduce((sum, s) => sum + parseFloat(s.bid_amount || 0), 0))}
                </Text>
                <Divider style={{ margin: '8px 0' }} />
                <Text style={{ display: 'block', fontSize: 12, color: '#94a3b8' }}>Next Month Calculated Installment:</Text>
                <Text style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa' }}>
                  {formatCurrency(
                    auctionSlots.reduce((sum, s) => sum + parseFloat(s.bid_amount || 0), 0) / selectedGroup.total_members
                  )} <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 'normal' }}>per slot</span>
                </Text>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" style={{ background: '#022c22', borderColor: '#065f46' }}>
                <Text style={{ display: 'block', fontSize: 12, color: '#34d399' }}>Commission Profit:</Text>
                <Text style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>
                  {formatCurrency(auctionSlots.reduce((sum, s) => sum + parseFloat(s.commission_amount || 0), 0))}
                </Text>
                <Divider style={{ margin: '8px 0' }} />
                <Text style={{ display: 'block', fontSize: 12, color: '#34d399' }}>Service Charge Profit:</Text>
                <Text style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>
                  {formatCurrency(auctionSlots.reduce((sum, s) => sum + parseFloat(s.service_charge || 0), 0))}
                </Text>
                <Divider style={{ margin: '8px 0' }} />
                <Text style={{ display: 'block', fontSize: 12, color: '#34d399' }}>Caller Discount Profit:</Text>
                <Text style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>
                  {formatCurrency(
                    auctionSlots.reduce((sum, s) => {
                      if (s.slot_type === 'caller') {
                        return sum + (parseFloat(selectedGroup.chit_value) - parseFloat(s.bid_amount || 0))
                      }
                      return sum
                    }, 0)
                  )}
                </Text>
                <Divider style={{ margin: '8px 0' }} />
                <Text style={{ display: 'block', fontSize: 12, color: '#34d399', fontWeight: 'bold' }}>Total Firm Profit This Month:</Text>
                <Text style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>
                  {formatCurrency(
                    auctionSlots.reduce((sum, s) => sum + parseFloat(s.commission_amount || 0) + parseFloat(s.service_charge || 0), 0) +
                    auctionSlots.reduce((sum, s) => {
                      if (s.slot_type === 'caller') {
                        return sum + (parseFloat(selectedGroup.chit_value) - parseFloat(s.bid_amount || 0))
                      }
                      return sum
                    }, 0)
                  )}
                </Text>
              </Card>
            </Col>
          </Row>
        )}
      </Modal>

      {/* Edit Payout & Service Charge Modal */}
      <Modal
        title="Edit Payout & Service Charge Details"
        open={editPayoutModal}
        onCancel={() => setEditPayoutModal(false)}
        onOk={handleSavePayout}
        confirmLoading={submitting}
        okText="Save Payout Details"
        width={500}
        destroyOnClose
      >
        <Form
          form={payoutForm}
          layout="vertical"
          onFinish={handleSavePayout}
          onSubmit={(e) => e.preventDefault()}
          onValuesChange={(changed, all) => {
            const bid = parseFloat(all.bid_amount || 0)
            const comm = parseFloat(all.commission_amount || 0)
            const sc = parseFloat(all.service_charge || 0)
            payoutForm.setFieldValue('net_received', bid - comm - sc)
          }}
        >
          <Form.Item label="Gross Bid / Draw Value (₹)" name="bid_amount">
            <InputNumber disabled style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item label="Commission (₹)" name="commission_amount" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item label="Service Charge (₹)" name="service_charge" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
          <Form.Item label="Net Handover (₹)" name="net_received">
            <InputNumber disabled style={{ width: '100%' }} prefix="₹" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Handover Payout Modal */}
      <Modal
        title="Confirm Welfare Payout Handover"
        open={handoverModal.open}
        onCancel={() => setHandoverModal({ open: false, enrollment: null })}
        onOk={handleHandoverSubmit}
        confirmLoading={submitting}
        okText="Confirm Handover"
        width={500}
        destroyOnClose
      >
        {handoverModal.enrollment && (
          <div style={{ marginBottom: 16 }}>
            <p>You are marking this welfare payout as handed over/disbursed.</p>
            <div style={{ padding: 12, background: '#1e293b', borderRadius: 6, border: '1px solid #334155', marginBottom: 16 }}>
              <div><strong>Recipient:</strong> {handoverModal.enrollment.member_name} ({handoverModal.enrollment.ticket_number})</div>
              <div><strong>Net Handover Amount:</strong> <strong style={{ color: '#10b981' }}>{formatCurrency(handoverModal.enrollment.prize_amount)}</strong></div>
            </div>
          </div>
        )}
        <Form
          form={handoverForm}
          layout="vertical"
          onFinish={handleHandoverSubmit}
          onSubmit={(e) => e.preventDefault()}
        >
          <Form.Item 
            label="Handover Date" 
            name="received_date"
            rules={[{ required: true, message: 'Please select handover date' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item 
            label="Payment Mode" 
            name="payout_payment_mode"
            rules={[{ required: true, message: 'Please select payment mode' }]}
          >
            <Select style={{ width: '100%' }}>
              <Select.Option value="cash">Cash</Select.Option>
              <Select.Option value="cheque">Cheque</Select.Option>
              <Select.Option value="bank_transfer">Bank Transfer</Select.Option>
              <Select.Option value="upi">UPI</Select.Option>
            </Select>
          </Form.Item>

          {handoverPaymentMode !== 'cash' && (
            <Form.Item 
              label={handoverPaymentMode === 'cheque' ? "Cheque Number" : "Transaction Ref Number"} 
              name="cheque_number"
              rules={[{ required: true, message: 'Please enter details' }]}
            >
              <Input placeholder={handoverPaymentMode === 'cheque' ? "Enter cheque number" : "Enter bank reference/UPI transaction ID"} />
            </Form.Item>
          )}
        </Form>
        <Alert
          message="Once marked as handed over, the payout transaction will be recorded in the daily cash ledger, and payout details cannot be modified further."
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
        />
      </Modal>

      {/* Payment Modal */}
      {/* View Payments Modal */}
      <Modal
        title={
          <div style={{ paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: 16, fontWeight: 'bold' }}>Installment Payment History</span>
            <div style={{ fontSize: 13, fontWeight: 'normal', color: '#6b7280', marginTop: 4 }}>
              Ticket {selectedEnrollment?.ticket_number} — {selectedEnrollment?.member_name || selectedEnrollment?.non_member_name || 'Non-Member'}
            </div>
          </div>
        }
        open={paymentsModal}
        onCancel={() => setPaymentsModal(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setPaymentsModal(false)}>
            Close
          </Button>
        ]}
        width={720}
      >
        <Table
          dataSource={enrollmentPayments}
          loading={loadingPayments}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ y: 350 }}
          columns={[
            {
              title: 'Month',
              dataIndex: 'month_number',
              key: 'month_number',
              width: 70,
              align: 'center',
              render: (m) => <span style={{ fontWeight: 600 }}>{m}</span>
            },
            {
              title: 'Due Date',
              dataIndex: 'due_date',
              key: 'due_date',
              width: 100,
              render: (d) => formatDate(d)
            },
            {
              title: 'Installment (₹)',
              dataIndex: 'installment_amount',
              key: 'installment_amount',
              width: 100,
              align: 'right',
              render: (v) => formatCurrency(v)
            },
            {
              title: 'Paid (₹)',
              dataIndex: 'amount_paid',
              key: 'amount_paid',
              width: 100,
              align: 'right',
              render: (v) => formatCurrency(v)
            },
            {
              title: 'Paid Date',
              dataIndex: 'paid_date',
              key: 'paid_date',
              width: 100,
              render: (d) => d ? formatDate(d) : '-'
            },
            {
              title: 'Mode',
              dataIndex: 'payment_mode',
              key: 'payment_mode',
              width: 80,
              render: (m, row) => row.is_paid ? <Tag>{m?.toUpperCase()}</Tag> : '-'
            },
            {
              title: 'Receipt',
              dataIndex: 'receipt_no',
              key: 'receipt_no',
              width: 100,
              render: (r) => r || '-'
            },
            {
              title: 'Status',
              dataIndex: 'is_paid',
              key: 'is_paid',
              width: 80,
              align: 'center',
              render: (paid) => paid ? <Tag color="green">Paid</Tag> : <Tag color="red">Unpaid</Tag>
            }
          ]}
        />
      </Modal>

      <PaymentModal
        open={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, payment: null })}
        onSubmit={handlePayment}
        loading={submitting}
        title={`Record Payment — Month ${paymentModal.payment?.month_number}`}
        amount={paymentModal.payment ? (parseFloat(paymentModal.payment.installment_amount || 0) - parseFloat(paymentModal.payment.amount_paid || 0)) : 0}
        monthNumber={paymentModal.payment?.month_number}
      />
    </div>
  )
}

export default WelfarePage
