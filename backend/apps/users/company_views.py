from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from apps.users.models import Company, CompanyMember, User
from apps.users.permissions import IsClient
from apps.users.serializers import UserSerializer
from apps.users.inn import validate_company_inn
from apps.common.openapi import EmptySerializer, PhoneRequestSerializer


COMPANY_FIELDS = (
    'inn', 'name', 'address', 'phone', 'director_name',
    'bank_name', 'bank_account', 'mfo', 'oked',
)


def serialize_company(company: Company) -> dict:
    return {field: getattr(company, field, '') or '' for field in COMPANY_FIELDS}


class CompanyProfileView(APIView):
    serializer_class = EmptySerializer
    permission_classes = [IsAuthenticated, IsClient]

    def _company(self, user):
        if not user.company_inn:
            return None
        return Company.objects.filter(inn=user.company_inn).first()

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        company = self._company(request.user)
        if not company:
            return Response({'company': None, 'company_inn': request.user.company_inn})
        return Response({'company': serialize_company(company)})

    @extend_schema(responses={200: {'type': 'object'}})
    def patch(self, request):
        company = self._company(request.user)
        if not company:
            return Response({'error': 'Kompaniya topilmadi'}, status=status.HTTP_404_NOT_FOUND)
        updatable = {
            'name': 255,
            'address': 500,
            'phone': 30,
            'director_name': 255,
            'bank_name': 255,
            'bank_account': 34,
            'mfo': 5,
            'oked': 10,
        }
        for field, max_len in updatable.items():
            if field in request.data:
                setattr(company, field, str(request.data.get(field) or '').strip()[:max_len])
        company.save()
        return Response({'company': serialize_company(company)})


class CompanyMembersView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

    def _get_admin_membership(self, user):
        if not user.company_inn:
            return None
        return CompanyMember.objects.filter(
            company_id=user.company_inn,
            user=user,
            role=CompanyMember.ROLE_ADMIN,
        ).first()

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        if not request.user.company_inn:
            return Response({'members': [], 'company_inn': None, 'company': None})
        company = Company.objects.filter(inn=request.user.company_inn).first()
        members = CompanyMember.objects.filter(company_id=request.user.company_inn).select_related('user')
        return Response({
            'company_inn': request.user.company_inn,
            'company': serialize_company(company) if company else None,
            'members': [
                {
                    'id': member.id,
                    'role': member.role,
                    'joined_at': member.joined_at.isoformat(),
                    'user': UserSerializer(member.user).data,
                }
                for member in members
            ],
        })

    @extend_schema(
        request=PhoneRequestSerializer,
        responses={201: {'type': 'object'}},
    )
    def post(self, request):
        if not self._get_admin_membership(request.user):
            return Response({'error': 'Faqat kompaniya admini a\'zo qo\'sha oladi'}, status=status.HTTP_403_FORBIDDEN)

        phone = (request.data.get('phone') or '').strip()
        if not phone:
            return Response({'error': 'Telefon raqam talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            member_user = User.objects.get(phone=phone, is_client=True, is_active=True)
        except User.DoesNotExist:
            return Response({'error': 'Mijoz topilmadi'}, status=status.HTTP_404_NOT_FOUND)

        if member_user.company_inn and member_user.company_inn != request.user.company_inn:
            return Response({'error': 'Foydalanuvchi boshqa kompaniyaga biriktirilgan'}, status=status.HTTP_400_BAD_REQUEST)

        company = Company.objects.get(inn=request.user.company_inn)
        member_user.company_inn = company.inn
        member_user.save(update_fields=['company_inn', 'updated_at'])
        membership, created = CompanyMember.objects.get_or_create(
            company=company,
            user=member_user,
            defaults={'role': CompanyMember.ROLE_MEMBER},
        )
        if not created:
            return Response({'error': 'Foydalanuvchi allaqachon kompaniyada'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'id': membership.id,
            'role': membership.role,
            'user': UserSerializer(member_user).data,
        }, status=status.HTTP_201_CREATED)


class CompanyBootstrapView(APIView):
    """Mavjud mijoz uchun kompaniya yozuvini yaratadi."""
    permission_classes = [IsAuthenticated, IsClient]
    serializer_class = EmptySerializer

    @extend_schema(responses={200: {'type': 'object'}})
    def post(self, request):
        if not request.user.company_inn:
            return Response({'error': 'STIR kiritilmagan'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            inn = validate_company_inn(request.user.company_inn)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        company, _ = Company.objects.get_or_create(inn=inn)
        membership, _ = CompanyMember.objects.get_or_create(
            company=company,
            user=request.user,
            defaults={'role': CompanyMember.ROLE_ADMIN},
        )
        if membership.role != CompanyMember.ROLE_ADMIN:
            membership.role = CompanyMember.ROLE_ADMIN
            membership.save(update_fields=['role'])
        return Response({'company_inn': company.inn, 'role': membership.role})
