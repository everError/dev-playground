package main

import (
	"context"
	"io"
	"log"
	"time"

	pb "grpc-example/proto/hello"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := grpc.NewClient("localhost:50051",
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		log.Fatalf("❌ Failed to connect: %v", err)
	}
	defer conn.Close()

	client := pb.NewHelloServiceClient(conn)

	stream, err := client.SayHelloStream(ctx, &pb.HelloRequest{Name: "OOOOOOO"})
	if err != nil {
		log.Fatalf("❌ Error calling SayHelloStream: %v", err)
	}

	for {
		res, err := stream.Recv()
		if err == io.EOF {
			log.Println("✅ Stream finished.")
			break
		}
		if err != nil {
			log.Fatalf("❌ Error receiving stream: %v", err)
		}
		log.Printf("📨 Received: %s", res.GetMessage())
	}
}
