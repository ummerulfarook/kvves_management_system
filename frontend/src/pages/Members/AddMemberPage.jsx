import { useState } from 'react'
import {
  Form, Input, Select, DatePicker, Upload, Button, Steps, Typography, Row, Col,
  Divider, Space, message, Card, Descriptions, InputNumber,
} from 'antd'
import { UploadOutlined, CheckOutlined, ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import dayjs from 'dayjs'
import * as membersApi from '../../api/members'
import {
  GENDER_OPTIONS, MEMBERSHIP_TYPE_OPTIONS, MEMBER_STATUS_OPTIONS,
} from '../../utils/constants'
import { phoneRule, aadhaarRule, panRule, pinRule } from '../../utils/validators'
import { formatDate, maskAadhaar } from '../../utils/formatters'
import { getErrorMessage } from '../../utils/formatters'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

const STEP_LABELS = ['Personal Details', 'Identity & Membership', 'Review & Submit']

const AddMemberPage = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const [form] = Form.useForm()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [allValues, setAllValues] = useState({})
  const [photoFile, setPhotoFile] = useState(null)

  useEffect(() => {
    if (isEdit) {
      membersApi.getMember(id).then((res) => {
        const data = res.data
        form.setFieldsValue({
          ...data,
          date_of_birth: data.date_of_birth ? dayjs(data.date_of_birth) : null,
          joining_date: data.joining_date ? dayjs(data.joining_date) : null,
          masavari_paid_till: data.masavari_paid_till ? dayjs(data.masavari_paid_till) : null,
        })
      }).catch(() => message.error('Failed to load member data.'))
    }
  }, [id, form, isEdit])

  const handleNext = async () => {
    const step0Fields = ['full_name', 'gender', 'phone', 'address', 'district']
    const step1Fields = ['member_no', 'membership_type', 'joining_date']

    try {
      if (currentStep === 0) {
        await form.validateFields(step0Fields)
      } else if (currentStep === 1) {
        await form.validateFields(step1Fields)
      }
      const values = form.getFieldsValue(true)
      setAllValues(values)
      setCurrentStep((s) => s + 1)
    } catch (_) {}
  }

  const handleBack = () => setCurrentStep((s) => s - 1)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const values = form.getFieldsValue(true)
      const payload = {
        ...values,
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : null,
        joining_date: values.joining_date ? values.joining_date.format('YYYY-MM-DD') : null,
        masavari_paid_till: values.masavari_paid_till ? values.masavari_paid_till.startOf('month').format('YYYY-MM-DD') : null,
      }
      delete payload.photo

      let savedMember
      if (isEdit) {
        const res = await membersApi.updateMember(id, payload)
        savedMember = res.data
      } else {
        const res = await membersApi.createMember(payload)
        savedMember = res.data
      }

      // Upload photo if provided
      if (photoFile) {
        const fd = new FormData()
        fd.append('photo', photoFile)
        await membersApi.uploadMemberPhoto(savedMember.id, fd)
      }

      message.success(`Member ${isEdit ? 'updated' : 'created'} successfully!`)
      navigate(`/members/${savedMember.id}`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const renderStep0 = () => (
    <Row gutter={[16, 0]}>
      <Col xs={24} md={12}>
        <Form.Item label="Full Name (English)" name="full_name" rules={[{ required: true, message: 'Required' }]}>
          <Input id="member-full-name" placeholder="Full name in English" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Full Name (Malayalam)" name="full_name_ml">
          <Input id="member-full-name-ml" placeholder="Malayalam name (optional)"
            style={{ fontFamily: 'Noto Sans Malayalam' }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item label="Date of Birth" name="date_of_birth">
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" id="member-dob" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item label="Gender" name="gender" rules={[{ required: true, message: 'Required' }]}>
          <Select id="member-gender" placeholder="Select gender">
            {GENDER_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item label="Phone" name="phone" rules={[{ required: true, message: 'Required' }, phoneRule]}>
          <Input id="member-phone" placeholder="10 digit phone number" maxLength={10} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item label="Alternate Phone" name="alternate_phone" rules={[phoneRule]}>
          <Input id="member-alt-phone" placeholder="Optional alternate phone" maxLength={10} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Invalid email' }]}>
          <Input id="member-email" placeholder="email@example.com" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item label="Address" name="address" rules={[{ required: true, message: 'Required' }]}>
          <TextArea id="member-address" rows={2} placeholder="Full address" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item label="Ward" name="ward">
          <Input id="member-ward" placeholder="Ward name" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item label="Panchayat / Municipality" name="panchayat">
          <Input id="member-panchayat" placeholder="Panchayat name" />
        </Form.Item>
      </Col>
      <Col xs={24} md={6}>
        <Form.Item label="District" name="district" rules={[{ required: true, message: 'Required' }]}
          initialValue="Kannur">
          <Input id="member-district" placeholder="District" />
        </Form.Item>
      </Col>
      <Col xs={24} md={4}>
        <Form.Item label="PIN Code" name="pin_code" rules={[pinRule]}>
          <Input id="member-pin" placeholder="6 digits" maxLength={6} />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Divider orientation="left" style={{ fontSize: 13, color: '#6b7280' }}>Business Information (Optional)</Divider>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Business / Shop Name" name="business_name">
          <Input id="member-business-name" placeholder="e.g. Sunshine Traders" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Business Address" name="business_address">
          <TextArea id="member-business-address" rows={2} placeholder="Business / shop address" />
        </Form.Item>
      </Col>
    </Row>
  )

  const renderStep1 = () => (
    <Row gutter={[16, 0]}>
      <Col xs={24} md={12}>
        <Form.Item label="Member Number" name="member_no" rules={[{ required: !isEdit, message: 'Required' }]}>
          <Input id="member-no" placeholder="e.g. MEM001" disabled={isEdit} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Aadhaar Number" name="aadhaar_number" rules={[aadhaarRule]}>
          <Input id="member-aadhaar" placeholder="12-digit Aadhaar" maxLength={12} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="PAN Number" name="pan_number" rules={[panRule]}>
          <Input id="member-pan" placeholder="ABCDE1234F" maxLength={10} style={{ textTransform: 'uppercase' }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Membership Type" name="membership_type" rules={[{ required: true, message: 'Required' }]}
          initialValue="regular">
          <Select id="member-membership-type">
            {MEMBERSHIP_TYPE_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Joining Date" name="joining_date" initialValue={dayjs()} rules={[{ required: true, message: 'Required' }]}>
          <DatePicker id="member-joining-date" style={{ width: '100%' }} format="DD/MM/YYYY"
            disabledDate={(d) => d && d.isAfter(dayjs())} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Status" name="status" initialValue="active">
          <Select id="member-status">
            {MEMBER_STATUS_OPTIONS.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Masavari Monthly Amount (₹)" name="masavari_amount" initialValue={50.00} rules={[{ required: true, message: 'Required' }]}>
          <InputNumber id="member-masavari-amount" min={0} style={{ width: '100%' }} prefix="₹" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Masavari Paid Till" name="masavari_paid_till" help="Optional. Auto-creates paid Masavari payments from joining date up to this month to prevent auto-deactivation.">
          <DatePicker id="member-masavari-paid-till" picker="month" format="MM/YYYY" style={{ width: '100%' }}
            disabledDate={(d) => d && d.isAfter(dayjs())} />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item label="Member Photo" name="photo">
          <Upload
            id="member-photo-upload"
            beforeUpload={(file) => {
              setPhotoFile(file)
              return false
            }}
            accept="image/*"
            maxCount={1}
            listType="picture"
          >
            <Button icon={<UploadOutlined />}>Upload Photo</Button>
          </Upload>
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item label="Remarks" name="remarks">
          <TextArea id="member-remarks" rows={3} placeholder="Optional remarks" />
        </Form.Item>
      </Col>
    </Row>
  )

  const renderStep2 = () => {
    const v = form.getFieldsValue(true)
    return (
      <div>
        <Card title="Personal Details" style={{ marginBottom: 16 }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Full Name">{v.full_name}</Descriptions.Item>
            <Descriptions.Item label="Malayalam Name">{v.full_name_ml || '—'}</Descriptions.Item>
            <Descriptions.Item label="Date of Birth">
              {v.date_of_birth ? v.date_of_birth.format('DD/MM/YYYY') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Gender">{GENDER_OPTIONS.find((o) => o.value === v.gender)?.label || v.gender}</Descriptions.Item>
            <Descriptions.Item label="Phone">{v.phone}</Descriptions.Item>
            <Descriptions.Item label="Email">{v.email || '—'}</Descriptions.Item>
            <Descriptions.Item label="Address" span={2}>{v.address}</Descriptions.Item>
            <Descriptions.Item label="Ward">{v.ward || '—'}</Descriptions.Item>
            <Descriptions.Item label="Panchayat">{v.panchayat || '—'}</Descriptions.Item>
            <Descriptions.Item label="District">{v.district}</Descriptions.Item>
            <Descriptions.Item label="PIN Code">{v.pin_code || '—'}</Descriptions.Item>
            {v.business_name && (
              <Descriptions.Item label="Business Name" span={2}>{v.business_name}</Descriptions.Item>
            )}
            {v.business_address && (
              <Descriptions.Item label="Business Address" span={2}>{v.business_address}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>
        <Card title="Identity & Membership">
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Member No">{v.member_no}</Descriptions.Item>
            <Descriptions.Item label="Membership Type">
              {MEMBERSHIP_TYPE_OPTIONS.find((o) => o.value === v.membership_type)?.label}
            </Descriptions.Item>
            <Descriptions.Item label="Aadhaar">{maskAadhaar(v.aadhaar_number)}</Descriptions.Item>
            <Descriptions.Item label="PAN">{v.pan_number || '—'}</Descriptions.Item>
            <Descriptions.Item label="Joining Date">
              {v.joining_date ? v.joining_date.format('DD/MM/YYYY') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Masavari Paid Till">
              {v.masavari_paid_till ? v.masavari_paid_till.format('MM/YYYY') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Masavari Monthly Amount">
              ₹{v.masavari_amount}
            </Descriptions.Item>
            <Descriptions.Item label="Status">{v.status}</Descriptions.Item>
            <Descriptions.Item label="Remarks" span={2}>{v.remarks || '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {isEdit ? 'Edit Member' : 'Add New Member'}
          </Title>
        </div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/members')}>
          Back to Members
        </Button>
      </div>

      <Card>
        <Steps
          current={currentStep}
          items={STEP_LABELS.map((label) => ({ title: label }))}
          style={{ marginBottom: 32 }}
        />

        <Form form={form} layout="vertical" scrollToFirstError>
          {currentStep === 0 && renderStep0()}
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
        </Form>

        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            id="member-form-back"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            Previous
          </Button>
          <Space>
            {currentStep < 2 ? (
              <Button type="primary" icon={<ArrowRightOutlined />} onClick={handleNext} id="member-form-next">
                Next
              </Button>
            ) : (
              <Button
                type="primary" icon={<CheckOutlined />}
                loading={loading} onClick={handleSubmit}
                id="member-form-submit"
              >
                {isEdit ? 'Save Changes' : 'Create Member'}
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  )
}

export default AddMemberPage
