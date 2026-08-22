<?php

declare(strict_types=1);

namespace App\Tests\Functional\Employees;

use App\Entity\User;
use App\Enum\RoleName;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class EmployeePhotoTest extends WebTestCase
{
    private const URL = '/api/v1/employees/me/photo/';

    public function testUploadSetsPhotoAndReturnsUrl(): void
    {
        $client = static::createClient();
        $employee = $this->employeeWithProfile($client);
        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $client->request('POST', self::URL, server: $this->authHeader($accessToken), files: ['photo' => $this->jpegFile()]);

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNotNull($body['photo_url']);
        self::assertStringContainsString((string) $employee->getId(), $body['photo_url']);

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        $refreshed = static::getContainer()->get(\App\Repository\EmployeeRepository::class)->find($employee->getId());
        self::assertNotNull($refreshed->getPhotoFilename());

        @unlink(static::getContainer()->getParameter('app.employee_photo_dir').'/'.$refreshed->getPhotoFilename());
    }

    public function testReuploadReplacesPreviousFile(): void
    {
        $client = static::createClient();
        $employee = $this->employeeWithProfile($client);
        [$client, $accessToken] = $this->login($employee->getUser(), $client);
        $photoDir = static::getContainer()->getParameter('app.employee_photo_dir');

        $client->request('POST', self::URL, server: $this->authHeader($accessToken), files: ['photo' => $this->jpegFile()]);
        self::assertResponseIsSuccessful();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        $afterFirst = static::getContainer()->get(\App\Repository\EmployeeRepository::class)->find($employee->getId())->getPhotoFilename();

        // Re-upload as PNG: extension changes, so the old .jpg must be
        // deleted rather than left orphaned on disk.
        $client->request('POST', self::URL, server: $this->authHeader($accessToken), files: ['photo' => $this->pngFile()]);
        self::assertResponseIsSuccessful();

        $em->clear();
        $refreshed = static::getContainer()->get(\App\Repository\EmployeeRepository::class)->find($employee->getId());
        self::assertNotSame($afterFirst, $refreshed->getPhotoFilename());
        self::assertFileDoesNotExist($photoDir.'/'.$afterFirst);
        self::assertFileExists($photoDir.'/'.$refreshed->getPhotoFilename());

        @unlink($photoDir.'/'.$refreshed->getPhotoFilename());
    }

    public function testUploadRejectsNonImageContent(): void
    {
        $client = static::createClient();
        $employee = $this->employeeWithProfile($client);
        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $tempPath = tempnam(sys_get_temp_dir(), 'not-a-photo-');
        file_put_contents($tempPath, 'this is definitely not an image');
        $file = new UploadedFile($tempPath, 'photo.jpg', 'image/jpeg', null, true);

        $client->request('POST', self::URL, server: $this->authHeader($accessToken), files: ['photo' => $file]);

        self::assertResponseStatusCodeSame(400);
        self::assertSame('Only JPG, PNG, and WEBP images are supported.', json_decode($client->getResponse()->getContent(), true)['data']['message']);
    }

    public function testUploadRejectsOversizedFile(): void
    {
        $client = static::createClient();
        $employee = $this->employeeWithProfile($client);
        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $tempPath = tempnam(sys_get_temp_dir(), 'huge-photo-').'.jpg';
        file_put_contents($tempPath, str_repeat('0', 6 * 1024 * 1024));
        $file = new UploadedFile($tempPath, 'huge.jpg', 'image/jpeg', null, true);

        $client->request('POST', self::URL, server: $this->authHeader($accessToken), files: ['photo' => $file]);

        self::assertResponseStatusCodeSame(400);
        self::assertSame('File size exceeds the 5 MB limit.', json_decode($client->getResponse()->getContent(), true)['data']['message']);
    }

    public function testUploadWithoutFileReturns400(): void
    {
        $client = static::createClient();
        $employee = $this->employeeWithProfile($client);
        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $client->request('POST', self::URL, server: $this->authHeader($accessToken));

        self::assertResponseStatusCodeSame(400);
    }

    public function testUploadReturns404WithoutLinkedProfile(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::URL, server: $this->authHeader($accessToken), files: ['photo' => $this->jpegFile()]);

        self::assertResponseStatusCodeSame(404);
    }

    public function testDeleteRemovesPhoto(): void
    {
        $client = static::createClient();
        $employee = $this->employeeWithProfile($client);
        [$client, $accessToken] = $this->login($employee->getUser(), $client);
        $photoDir = static::getContainer()->getParameter('app.employee_photo_dir');

        $client->request('POST', self::URL, server: $this->authHeader($accessToken), files: ['photo' => $this->jpegFile()]);
        self::assertResponseIsSuccessful();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        $filename = static::getContainer()->get(\App\Repository\EmployeeRepository::class)->find($employee->getId())->getPhotoFilename();
        self::assertFileExists($photoDir.'/'.$filename);

        $client->request('DELETE', self::URL, server: $this->authHeader($accessToken));

        self::assertResponseIsSuccessful();
        self::assertNull(json_decode($client->getResponse()->getContent(), true)['data']['photo_url']);
        self::assertFileDoesNotExist($photoDir.'/'.$filename);
    }

    public function testDeleteIsIdempotentWhenNoPhotoSet(): void
    {
        $client = static::createClient();
        $employee = $this->employeeWithProfile($client);
        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $client->request('DELETE', self::URL, server: $this->authHeader($accessToken));

        self::assertResponseIsSuccessful();
        self::assertNull(json_decode($client->getResponse()->getContent(), true)['data']['photo_url']);
    }

    private function employeeWithProfile(KernelBrowser $client): \App\Entity\Employee
    {
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $employee->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $employee;
    }

    private function jpegFile(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'photo-').'.jpg';
        $image = imagecreatetruecolor(10, 10);
        imagejpeg($image, $path);
        imagedestroy($image);

        return new UploadedFile($path, 'photo.jpg', 'image/jpeg', null, true);
    }

    private function pngFile(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'photo-').'.png';
        $image = imagecreatetruecolor(10, 10);
        imagepng($image, $path);
        imagedestroy($image);

        return new UploadedFile($path, 'photo.png', 'image/png', null, true);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAs(RoleName $role, KernelBrowser $client): array
    {
        $user = UserFactory::new()->withRoles($role)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($user, $client);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function login(User $user, KernelBrowser $client): array
    {
        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $login = json_decode($client->getResponse()->getContent(), true)['data'];

        return [$client, $login['access']];
    }

    /**
     * @return array<string, string>
     */
    private function authHeader(string $accessToken): array
    {
        return ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken];
    }
}
