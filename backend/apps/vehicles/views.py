from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from apps.users.permissions import IsDriver
from .models import Vehicle
from .serializers import VehicleSerializer, VehicleCreateSerializer


class VehicleListView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: VehicleSerializer(many=True)})
    def get(self, request):
        vehicles = Vehicle.objects.filter(user=request.user)
        serializer = VehicleSerializer(vehicles, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=VehicleCreateSerializer, responses={201: VehicleSerializer})
    def post(self, request):
        serializer = VehicleCreateSerializer(data=request.data)
        if serializer.is_valid():
            vehicle = serializer.save(user=request.user)
            return Response(VehicleSerializer(vehicle).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VehicleDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: VehicleSerializer})
    def get(self, request, pk):
        try:
            vehicle = Vehicle.objects.get(pk=pk, user=request.user)
            serializer = VehicleSerializer(vehicle)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Vehicle.DoesNotExist:
            return Response({'error': 'Vehicle not found'}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(request=VehicleCreateSerializer, responses={200: VehicleSerializer})
    def put(self, request, pk):
        try:
            vehicle = Vehicle.objects.get(pk=pk, user=request.user)
            serializer = VehicleCreateSerializer(vehicle, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(VehicleSerializer(vehicle).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Vehicle.DoesNotExist:
            return Response({'error': 'Vehicle not found'}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        try:
            vehicle = Vehicle.objects.get(pk=pk, user=request.user)
            vehicle.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Vehicle.DoesNotExist:
            return Response({'error': 'Vehicle not found'}, status=status.HTTP_404_NOT_FOUND)
