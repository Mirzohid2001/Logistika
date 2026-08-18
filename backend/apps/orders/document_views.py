from __future__ import annotations

from django.http import FileResponse, HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order, OrderDocument
from apps.orders.documents import (
    DOC_PREFIX,
    ensure_order_documents,
    serialize_order_document,
)
from apps.users.permissions import can_access_order


def _order_for_docs(pk: int) -> Order:
    return Order.objects.select_related(
        'status',
        'driver',
        'client',
        'advertisement',
        'advertisement__departure_city',
        'advertisement__destination_city',
        'advertisement__departure_city__country',
        'advertisement__destination_city__country',
    ).prefetch_related('route_stops', 'driver__vehicles').get(pk=pk)


def _file_response(doc: OrderDocument, fmt: str):
    fmt = (fmt or 'html').lower()
    if fmt == 'xlsx':
        if not doc.xlsx_file:
            return HttpResponse('Excel fayl topilmadi', status=404)
        doc.xlsx_file.open('rb')
        return FileResponse(
            doc.xlsx_file,
            as_attachment=True,
            filename=f'{doc.number}.xlsx',
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
    if fmt == 'pdf':
        if not getattr(doc, 'pdf_file', None):
            fmt = 'html'
        else:
            doc.pdf_file.open('rb')
            return FileResponse(
                doc.pdf_file,
                as_attachment=True,
                filename=f'{doc.number}.pdf',
                content_type='application/pdf',
            )
    if not doc.html_file:
        return HttpResponse('Hujjat topilmadi', status=404)
    doc.html_file.open('rb')
    content = doc.html_file.read()
    doc.html_file.close()
    if isinstance(content, bytes):
        body = content.decode('utf-8')
    else:
        body = content
    response = HttpResponse(body, content_type='text/html; charset=utf-8')
    if fmt == 'download':
        response['Content-Disposition'] = f'attachment; filename="{doc.number}.html"'
    return response


class OrderDocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request, pk):
        try:
            order = _order_for_docs(pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        if not can_access_order(request.user, order):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        docs = order.documents.all()
        return Response({
            'documents': [serialize_order_document(doc, request) for doc in docs],
        })


class OrderDocumentGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: {'type': 'object'}})
    def post(self, request, pk):
        try:
            order = _order_for_docs(pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        if not can_access_order(request.user, order):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        docs = ensure_order_documents(order, force=True)
        return Response({
            'documents': [serialize_order_document(doc, request) for doc in docs],
        })


class OrderDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: {'type': 'string'}})
    def get(self, request, pk, doc_type):
        if doc_type not in DOC_PREFIX:
            return Response({'error': 'Unknown document type'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        if not can_access_order(request.user, order):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        try:
            doc = order.documents.get(doc_type=doc_type)
        except OrderDocument.DoesNotExist:
            docs = ensure_order_documents(order, doc_types=[doc_type], force=True)
            doc = docs[0]
        return _file_response(doc, request.query_params.get('file') or 'html')


class PublicOrderDocumentView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses={200: {'type': 'string'}})
    def get(self, request, token):
        try:
            doc = OrderDocument.objects.select_related('order').get(download_token=token)
        except (OrderDocument.DoesNotExist, ValueError):
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)
        return _file_response(doc, request.query_params.get('file') or 'html')
