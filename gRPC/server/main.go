package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"time"

	pb "grpc-example/proto/hello"

	"google.golang.org/grpc"
)

// HelloService 서버 구현체 정의
type helloServer struct {
	pb.UnimplementedHelloServiceServer
}

// SayHello 메서드 구현
func (s *helloServer) SayHello(ctx context.Context, req *pb.HelloRequest) (*pb.HelloReply, error) {
	name := req.GetName()
	log.Printf("✅ SayHello called with name: %s", name)
	return &pb.HelloReply{
		Message: fmt.Sprintf("Hello, %s!", name),
	}, nil
}
func (s *helloServer) SayHelloStream(req *pb.HelloRequest, stream pb.HelloService_SayHelloStreamServer) error {
	name := req.GetName()
	for i := 1; i <= 5; i++ {
		msg := fmt.Sprintf("Hello #%d to %s", i, name)
		if err := stream.Send(&pb.HelloReply{Message: msg}); err != nil {
			return err
		}
		time.Sleep(1 * time.Second)
	}
	return nil
}

func main() {
	// 50051 포트에서 TCP 리스너 시작
	listener, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("❌ Failed to listen: %v", err)
	}

	// gRPC 서버 생성
	grpcServer := grpc.NewServer()

	// gRPC 서비스 등록
	pb.RegisterHelloServiceServer(grpcServer, &helloServer{})

	log.Println("🚀 gRPC server is running on port 50051...")
	if err := grpcServer.Serve(listener); err != nil {
		log.Fatalf("❌ Failed to serve: %v", err)
	}
}
